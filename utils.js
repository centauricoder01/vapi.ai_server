import dayjs from "dayjs";
import fs from "fs";
import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URL = process.env.REDIRECT_URL;

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URL
);

export const prompt = `
      # Context:
      We have just asked the user when they would like to book a meeting. You will be provided with the current date and their response.

      # Instructions:
You must return the **start and end times** in **pure JSON format**, without any extra characters, markdown, or explanations, and always in **Indian Standard Time (IST, UTC+05:30)**.

      # Output example:
      {
        "starttime": "2024-04-19T09:00:00.000000+05:30",
        "endtime": "2024-04-19T17:00:00.000000+05:30"
      }

      # Rules:
- The output **must be a valid JSON object** (without markdown formatting). 
- The **start time** must always be **9:00 AM IST (Indian Standard Time, UTC+05:30)**.  
- The **end time** must always be **5:00 PM IST (Indian Standard Time, UTC+05:30)**.  
- The output must **strictly match the example format**.  
- Do **not** include explanations, text, or code formatting characters—return **only raw JSON**.
    `;

export const isOverlapping = (slot, busy) => {
  return (
    dayjs(slot.start).isBefore(dayjs(busy.end)) &&
    dayjs(slot.end).isAfter(dayjs(busy.start))
  );
};

export const checkFreeSlots = async (date, token, timezone) => {
  // const tokens = JSON.parse(fs.readFileSync("token.json"));
  oauth2Client.setCredentials(token);
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const startTime = dayjs(date.starttime).format("YYYY-MM-DDTHH:mm:ssZ");
  const endTime = dayjs(date.endtime).format("YYYY-MM-DDTHH:mm:ssZ");

  try {
    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: startTime,
        timeMax: endTime,
        timeZone: timezone,
        items: [{ id: "primary" }],
      },
    });

    const busySlots = response.data.calendars.primary.busy || [];
    let allSlots = [];
    let freeSlots = [];

    let start = dayjs(startTime);
    const end = dayjs(endTime);

    while (start.isBefore(end)) {
      let slotStart = start.tz(timezone).format("YYYY-MM-DDTHH:mm:ssZ");
      let slotEnd = start
        .add(1, "hour")
        .tz(timezone)
        .format("YYYY-MM-DDTHH:mm:ssZ");

      allSlots.push({ start: slotStart, end: slotEnd });

      start = start.add(1, "hour");
    }

    freeSlots = allSlots.filter(
      (slot) => !busySlots.some((busy) => isOverlapping(slot, busy))
    );

    return freeSlots;
  } catch (error) {
    return error.message;
  }
};
