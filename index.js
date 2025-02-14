import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { checkFreeSlots } from "./utils.js";
import axios from "axios";
import dayjs from "dayjs";
import { google } from "googleapis";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import connectDB from "./db.js";
import { ObjectId } from "mongodb";

// VARIABLE INITILIZATION

const PORT = process.env.PORT || 3000;
const uri = process.env.MONGODB_PASSWORD;
const SCOPES = ["https://www.googleapis.com/auth/calendar"];
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URL = process.env.REDIRECT_URL;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MIDDLEWARES
dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
dayjs.extend(utc);
dayjs.extend(timezone);
app.use(express.static(path.join(__dirname, "public")));

let db;

(async () => {
  db = await connectDB();
})();

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URL
);

const VAPI_API_KEY_PRIVATE = process.env.VAPI_API_KEY_PRIVATE;
const VAPI_BASE_URL = "https://api.vapi.ai";

// APIs
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/auth", (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  res.json({ url: authUrl }); // Send auth URL to frontend
});

app.get("/oauth2callback", async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const collection = db.collection("tokens");
  const result = await collection.insertOne(tokens);

  // res.sendFile(path.join(__dirname, "public", "home.html"));
  // res.status(201).json({ message: "Data stored successfully", data: result });

  res.redirect(`/home.html?user_id=${result.insertedId}`);
});

app.post("/check-availablity", async (req, res) => {
  const body = req.body;

  const mainResponse =
    body.message.toolWithToolCallList[0].toolCall.function.arguments;

  const getAssistantId = body.message.call.assistantId;

  const collection = db.collection("assistant");
  const tokenCollection = db.collection("tokens");

  const user = await collection.findOne({ assistantId: getAssistantId });

  const getToken = await tokenCollection.findOne({
    _id: new ObjectId(user.userId),
  });

  const userName = mainResponse._name;
  const dateAndTime = mainResponse._dateAndTime;

  let todaysDate = new Date().toISOString();

  const UserPrompt = `
  This is the current date/time: ${todaysDate}
  This is when the user would like to book: ${dateAndTime}
  `;

  const prompt = `
      # Context:
      We have just asked the user when they would like to book a meeting. You will be provided with the current date and their response.

      # Instructions:
      You must return the **start and end times** in **pure JSON format**, without any extra characters, markdown, or explanations, and always in ${user.timeZone} timezone.

      # Output example:
      {
        "starttime": "2024-04-19T09:00:00.000000",
        "endtime": "2024-04-19T17:00:00.000000"
      }

      # Rules:
      - The output **must be a valid JSON object** (without markdown formatting). 
      - The **start time** must always be **9:00 AM ${user.timeZone}**.  
      - The **end time** must always be **5:00 PM ${user.timeZone}**.  
      - The output must **strictly match the example format**.  
      - Do **not** include explanations, text, or code formatting characters—return **only raw JSON**.
      - Timezone is important so when you give the starttime and endtime, it should contain the proper timezone at the end. like if it's "Asia/Calcutta", then it should be like this : 

      {
        "starttime": "2024-04-19T09:00:00.000000+05:30",
        "endtime": "2024-04-19T17:00:00.000000+05:30"
      }

      And same with different time zones. 
    `;

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: UserPrompt },
      ],
      temperature: 0,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const dateAndTimeInJson = JSON.parse(
    response.data.choices[0]?.message?.content
  );

  const dayOfWeek = dayjs(dateAndTimeInJson?.starttime).format("dddd");

  // HANDLE WEEKENDS
  if (dayOfWeek === "Sunday" || dayOfWeek === "Saturday") {
    return res.status(200).json({
      results: [
        {
          toolCallId: body.message.toolWithToolCallList[0].toolCall.id,
          result: "Sorry, We Don't accept booking on Saturday and Sundays.",
        },
      ],
    });
  }

  // HANDLE WEEKDAYS
  try {
    const checkAvailability = await checkFreeSlots(
      dateAndTimeInJson,
      getToken,
      user.timeZone
    );

    const allSlots = checkAvailability
      .map((slot) => {
        return `${dayjs(slot.start).utcOffset(330).format("h A")} to ${dayjs(
          slot.end
        )
          .utcOffset(330)
          .format("h A")}`;
      })
      .join(", ");

    return res.status(200).json({
      results: [
        {
          toolCallId: body.message.toolWithToolCallList[0].toolCall.id,
          result: `Here are the available time slots: ${allSlots}. Let me know which one works for you!`,
        },
      ],
    });
  } catch (error) {
    return res.status(200).json({
      results: [
        {
          toolCallId: body.message.toolWithToolCallList[0].toolCall.id,
          result: "Sorry, Some Error Occured",
        },
      ],
    });
  }
});

app.post("/bookSlot", async (req, res) => {
  const body = req.body;

  const mainResponse =
    body.message.toolWithToolCallList[0].toolCall.function.arguments;

  const getAssistantId = body.message.call.assistantId;

  const collection = db.collection("assistant");
  const tokenCollection = db.collection("tokens");

  const user = await collection.findOne({ assistantId: getAssistantId });

  const getToken = await tokenCollection.findOne({
    _id: new ObjectId(user.userId),
  });

  const name = mainResponse._name;
  const dateAndTime = mainResponse._time;
  const email = mainResponse._email;

  if (!name || !email || !dateAndTime) {
    return res.status(200).json({
      results: [
        {
          toolCallId: body.message.toolWithToolCallList[0].toolCall.id,
          result: `Please provide all the details, like Name, Email, Date and Time`,
        },
      ],
    });
  }

  oauth2Client.setCredentials(getToken);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  let todaysDate = new Date().toISOString();

  const UserPrompt = `
  This is the current date/time: ${todaysDate}
  This is when the user would like to book: ${dateAndTime}
  `;

  const prompt = `
      # Context:
      We have just asked the user when they would like to book a meeting. You will be provided with the current date and their response.

      # Instructions:
You must return the **start and end times** in **pure JSON format**, without any extra characters, markdown, or explanations, and always in ${user.timeZone} timezone.

      # Output example:
      {
        "starttime": "2024-04-19T09:00:00.000000",
        "endtime": "2024-04-19T17:00:00.000000"
      }

      # Rules:
- The output **must be a valid JSON object** (without markdown formatting). 
- The **start time** must always be **9:00 AM ${user.timeZone}**.  
- The **end time** must always be **5:00 PM ${user.timeZone}**.  
- The output must **strictly match the example format**.  
- Do **not** include explanations, text, or code formatting characters—return **only raw JSON**.
- Timezone is important so when you give the starttime and endtime, it should contain the proper timezone at the end. like if it's "Asia/Calcutta", then it should be like this : 

      {
        "starttime": "2024-04-19T09:00:00.000000+05:30",
        "endtime": "2024-04-19T17:00:00.000000+05:30"
      }

      And same with different time zones. 
    `;

  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: "gpt-4",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: UserPrompt },
      ],
      temperature: 0,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  const dateAndTimeInJson = JSON.parse(
    response.data.choices[0]?.message?.content
  );

  const userRequestTime = dayjs(dateAndTime)
    .tz(user.timeZone, true)
    .format("YYYY-MM-DDTHH:mm:ssZ");

  try {
    const freeSlots = await checkFreeSlots(
      dateAndTimeInJson,
      getToken,
      user.timeZone
    );

    const isSlotFree = freeSlots.some((slot) => slot.start === userRequestTime);

    if (!isSlotFree) {
      return res.status(200).json({
        results: [
          {
            toolCallId: body.message.toolWithToolCallList[0].toolCall.id,
            result: `This Slot is already booked, Please choose another one.`,
          },
        ],
      });
    }

    let [datePart, timePart] = userRequestTime.split("T");
    let [hours, minutes, seconds] = timePart.substring(0, 8).split(":");
    let offset = timePart.substring(8); // Preserve the original +05:30

    // Convert hours to a number and add 1 hour
    hours = String(Number(hours) + 1).padStart(2, "0");

    // Construct the new time string
    const newTime = `${datePart}T${hours}:${minutes}:${seconds}${offset}`;

    const event = {
      summary: `Meeting with ${name}`,
      description: `Scheduled Meeting with ${name} (${email})`,
      start: { dateTime: userRequestTime, timeZone: user.timeZone },
      end: {
        dateTime: newTime,
        timeZone: user.timeZone,
      },
      attendees: [{ email }],
      conferenceData: {
        createRequest: {
          requestId: `meet-${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    };

    const createdEvent = await calendar.events.insert({
      calendarId: "primary",
      resource: event,
      conferenceDataVersion: 1,
    });

    return res.status(200).json({
      results: [
        {
          toolCallId: body.message.toolWithToolCallList[0].toolCall.id,
          result: `Meeting booked successfully. Please Check your calendar.`,
        },
      ],
    });
  } catch (error) {
    console.error("Error booking slot:", error);
    return res.status(200).json({
      results: [
        {
          toolCallId: body.message.toolWithToolCallList[0].toolCall.id,
          result: `An error occurred while booking the appointment. Please try again later.`,
        },
      ],
    });
  }
});

app.post("/create-assistant", async (req, res) => {
  try {
    const {
      name,
      // voice,
      language,
      firstMessage,
      content,
      user_id,
      userTimeZone,
    } = req.body;

    const payload = {
      name,
      // voice: voice || "CartesiaVoice",
      language: language || "en-US",
      firstMessage: firstMessage,
      model: {
        provider: "openai",
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `${content} You are a voice assistant designed to help users book appointments for various organizations using their Google Calendar. Each organization may have different services, hours, and appointment requirements, but your goal is to keep things simple, friendly, and efficient.

When interacting with callers, focus on gathering the necessary details to book their appointment:


### Style Guidelines:
Be playful, witty, and use casual language to make the caller feel comfortable.
Keep responses short and conversational, like you’re chatting with a friend. Feel free to use phrases like “Umm...”, “Let’s see...”, and “Cool, let’s do that.”
In case of conflicts or unavailable slots, kindly offer alternate options.
Stay adaptable: different organizations might have varying needs, but your main focus is always on securing the right appointment.
Avoid any specific mentions of organizations or locations unless prompted by the caller.


If they wish to schedule a Meeting, your goal is to gather necessary information from callers in a 
 friendly and efficient manner like follows:

1. Ask for their full name.
2. Ask for their preferred date and time for the Meeting. Take their response exactly as given. For example: If they say "tomorrow," the appointment should be set for
tomorrow. For reference, today is {{date}}.


## Function Call:
Once the customer name and preferred date and time for the meeting are collected, run the _checkAvailablityFunction function.


3. List five available times for the tour. Just state the times clearly and slowly.

4. If the user wants to book a meeting within the available times, ask for an email. If they need more options, ask them to choose from the available times and
repeat them.

5. Confirm the full name, email, and Meeting date and time. Correct if necessary and repeat to confirm with the user.


## Function Call:
Once the customer name, email, and Meeting start time have been confirmed, run the _confirmBoookingFunction function, and send the full date and time to the function like this: 2025-02-05T13:00:00. Don't just send 2PM to 3PM.


6. Ask the user if they would like to know anything else.

7. Be sure to be friendly and a bit witty! Keep responses short and simple, using casual language. Phrases like "Umm...," "Well...," and "I mean" are preferred.

8. Keep responses short, like a real conversation. Don't ramble for too long.

### Example Conversation Flow:
**Caller:** "Hi, I need to book an appointment."  
**Assistant:** "Sure! What’s your name?"  
**Caller:** "It’s Alex."  
**Assistant:** "Hey Alex! What’s the appointment for?"  
**Caller:** "Just a general consultation."  
**Assistant:** "Got it. When works best for you?"  
**Caller:** "Tomorrow at 10 AM."  
**Assistant:** "Checking availability... Umm, 10 AM isn’t free, but we’ve got 11 AM. Does that work?"  
**Caller:** "Sure, that’s fine."  
**Assistant:** "Awesome! You’re all set for a consultation tomorrow at 11 AM. Anything else I can help you with?"`,
          },
        ],
        toolIds: [
          "55cc8c06-3c1e-4376-acbe-083a16a19149",
          "bac31cee-cda9-4155-b94c-d346edd73cc2",
        ],
      },
    };

    const response = await axios.post(`${VAPI_BASE_URL}/assistant`, payload, {
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY_PRIVATE}`,
        "Content-Type": "application/json",
      },
    });

    const collection = db.collection("assistant");

    const findUser = await collection.findOne({ userId: user_id });

    if (!findUser) {
      await collection.insertOne({
        userId: user_id,
        timeZone: userTimeZone,
        assistantId: [response.data.id],
      });
    } else {
      await collection.updateOne(
        { userId: user_id },
        {
          $push: { assistantId: response.data.id },
        }
      );
    }

    return res.status(200).json({
      message: "Assistant Created and save.",
      data: response.data,
    });
  } catch (error) {
    console.error(
      "Error creating assistant:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      error: "Failed to create assistant",
      details: error.response?.data,
    });
  }
});

app.patch("/edit-assistant/:id", async (req, res) => {
  const agentId = req.params.id;

  try {
    const { name, firstMessage, content } = req.body;

    const payload = {
      name,
      firstMessage: firstMessage,
      model: {
        provider: "openai",
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: content,
          },
        ],
      },
    };

    const response = await axios.patch(
      `${VAPI_BASE_URL}/assistant/${agentId}`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${VAPI_API_KEY_PRIVATE}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.status(200).json({
      message: "Assistant edited successfully",
      data: response.data,
    });
  } catch (error) {
    console.error(
      "Error in editing assistant:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      error: "Failed to edit assistant",
      details: error.response?.data,
    });
  }
});

app.delete("/delete-assistant/:id", async (req, res) => {
  try {
    const agentId = req.params.id;

    const response = await axios.delete(
      `${VAPI_BASE_URL}/assistant/${agentId}`,
      {
        headers: {
          Authorization: `Bearer ${VAPI_API_KEY_PRIVATE}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.status(200).json({
      message: "Assistant delete successfully",
      data: response.data,
    });
  } catch (error) {
    console.error(
      "Error in delete assistant:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      error: "Failed to delete assistant",
      details: error.response?.data,
    });
  }
});

app.get("/get-assistants", async (req, res) => {
  try {
    const response = await axios.get(`${VAPI_BASE_URL}/assistant`, {
      headers: {
        Authorization: `Bearer ${VAPI_API_KEY_PRIVATE}`,
        "Content-Type": "application/json",
      },
    });

    return res.status(200).json({
      message: "Here is the list of all of your Assistant ",
      data: response.data,
    });
  } catch (error) {
    console.error(
      "Error Fetching assistant:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      error: "Some Error occured while fetching Assistants.",
      details: error.response?.data,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on PORT: ${PORT}`);
});
