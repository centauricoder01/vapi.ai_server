import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { prompt, checkFreeSlots, isOverlapping } from "./utils.js";
import axios from "axios";
import dayjs from "dayjs";
import { google } from "googleapis";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
dayjs.extend(utc);
dayjs.extend(timezone);

const PORT = process.env.PORT || 3000;
const SCOPES = ["https://www.googleapis.com/auth/calendar"];
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URL = process.env.REDIRECT_URL;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URL
);

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

  fs.writeFileSync("token.json", JSON.stringify(tokens));

  res.redirect(`/index.html?access_token=${tokens.access_token}`);
});

// app.get("/freeSlots", async (req, res) => {
//   if (!fs.existsSync("token.json"))
//     return res.status(401).json({ error: "User not authenticated" });

//   const tokens = JSON.parse(fs.readFileSync("token.json"));
//   oauth2Client.setCredentials(tokens);
//   const calendar = google.calendar({ version: "v3", auth: oauth2Client });

//   const body = req.body;
//   const startTime = `${body.date}T09:00:00+05:30`;
//   const endTime = `${body.date}T17:00:00+05:30`;

//   try {
//     const response = await calendar.freebusy.query({
//       requestBody: {
//         timeMin: startTime,
//         timeMax: endTime,
//         timeZone: "Asia/Kolkata",
//         items: [{ id: "primary" }],
//       },
//     });

//     const busySlots = response.data.calendars.primary.busy || [];
//     let allSlots = [];
//     let freeSlots = [];

//     let start = dayjs(startTime);
//     const end = dayjs(endTime);

//     while (start.isBefore(end)) {
//       let slotStart = start.tz("Asia/Kolkata").format("YYYY-MM-DDTHH:mm:ssZ");
//       let slotEnd = start
//         .add(1, "hour")
//         .tz("Asia/Kolkata")
//         .format("YYYY-MM-DDTHH:mm:ssZ");

//       allSlots.push({ start: slotStart, end: slotEnd });

//       start = start.add(1, "hour");
//     }

//     freeSlots = allSlots.filter(
//       (slot) => !busySlots.some((busy) => isOverlapping(slot, busy))
//     );

//     res.json(freeSlots);
//   } catch (error) {
//     res.status(500).send(error.message);
//   }
// });

app.post("/check-availablity", async (req, res) => {
  const body = req.body;

  // { _name: 'r Patel', _dateAndTime: 'tomorrow, 12 PM' }
  const mainResponse =
    body.message.toolWithToolCallList[0].toolCall.function.arguments;

  const userName = mainResponse._name;
  const dateAndTime = mainResponse._dateAndTime;

  let todaysDate = new Date().toISOString();

  const UserPrompt = `
  This is the current date/time: ${todaysDate}
  This is when the user would like to book: ${dateAndTime}
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
    const checkAvailability = await checkFreeSlots(dateAndTimeInJson);

    const allSlots = checkAvailability
      .map((slot) => {
        return `${dayjs(slot.start).format("h A")} to ${dayjs(slot.end).format(
          "h A"
        )}`;
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
  const { name, email, timeslot } = req.body;

  if (!name || !email || !timeslot) {
    return res
      .status(400)
      .json({ error: "Missing required fields: name, email, timeslot" });
  }

  if (!fs.existsSync("token.json")) {
    return res.status(401).json({ error: "User not authenticated" });
  }

  const tokens = JSON.parse(fs.readFileSync("token.json"));
  oauth2Client.setCredentials(tokens);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  // const startTime = new Date(timeslot);
  const startTime = dayjs(timeslot)
    .tz("Asia/Kolkata")
    .format("YYYY-MM-DDTHH:mm:ssZ");
  // const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1-hour slot
  const endTime = dayjs(timeslot)
    .tz("Asia/Kolkata")
    .add(1, "hour")
    .format("YYYY-MM-DDTHH:mm:ssZ"); // 1-hour slot

  try {
    // Step 1: Check if slot is free
    // const freeSlots = await getFreeSlots(
    //   startTime.toISOString(),
    //   endTime.toISOString()
    // );

    // const isSlotFree = freeSlots.some(
    //   (slot) => new Date(slot.start).toISOString() === startTime.toISOString()
    // );

    // if (!isSlotFree) {
    //   return res.status(400).json({ error: "This slot is already booked." });
    // }

    // Step 2: Create the event in Google Calendar
    const event = {
      summary: `Meeting with ${name}`,
      description: `Scheduled Meeting with ${name} (${email})`,
      start: { dateTime: startTime, timeZone: "Asia/Kolkata" },
      end: { dateTime: endTime, timeZone: "Asia/Kolkata" },
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

    return res.json({
      message: "Meeting booked successfully!",
      eventId: createdEvent.data.id,
      meetLink: createdEvent.data.hangoutLink || "No Meet link available",
    });
  } catch (error) {
    console.error("Error booking slot:", error);
    return res.status(500).json({ error: "Failed to book meeting." });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on PORT: ${PORT}`);
});
