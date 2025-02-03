import { google } from "googleapis";

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

// const credentials = JSON.parse(fs.readFileSync("credentials.json"));
// const tokens = JSON.parse(fs.readFileSync("token.json"));

// const { client_secret, client_id, redirect_uris } = credentials.installed;
// const oauth2Client = new google.auth.OAuth2(
//   client_id,
//   client_secret,
//   redirect_uris[0]
// );
// oauth2Client.setCredentials(tokens);

// const calendar = google.calendar({ version: "v3", auth: oauth2Client });

// export async function getFreeSlots(startTime, endTime) {
//   const response = await calendar.freebusy.query({
//     requestBody: {
//       timeMin: startTime,
//       timeMax: endTime,
//       items: [{ id: "primary" }],
//     },
//   });

//   const busySlots = response.data.calendars.primary.busy;
//   let allSlots = [];
//   let freeSlots = [];

//   let start = new Date(startTime);
//   let end = new Date(endTime);

//   while (start < end) {
//     let slotStart = new Date(start);
//     let slotEnd = new Date(start.getTime() + 30 * 60 * 1000); // 30-minute slots

//     allSlots.push({ start: slotStart, end: slotEnd });
//     start = slotEnd;
//   }

//   busySlots.forEach((busy) => {
//     let busyStart = new Date(busy.start);
//     let busyEnd = new Date(busy.end);
//     allSlots = allSlots.filter(
//       (slot) => !(slot.start >= busyStart && slot.end <= busyEnd)
//     );
//   });

//   freeSlots = allSlots;
//   return freeSlots;
// }

// Example Usage
// (async () => {
//   const startTime = "2025-02-09T09:00:00.000Z";
//   const endTime = "2025-02-09T17:00:00.000Z";
//   const availableSlots = await getFreeSlots(startTime, endTime);
//   console.log("Available Slots:", availableSlots);
// })();
