import { ActivityType, Client } from "discord.js";

const activities = [
  { name: "蛋蛋", type: ActivityType.Playing },
  { name: "PSYQUI", type: ActivityType.Listening },
  { name: "肉", type: ActivityType.Watching },
];

export default (client: Client) => {
  let i = 0;
  client.once("clientReady", () => {
    const setPresence = () => {
      if (client.user)
        client.user.setActivity(activities[i++ % activities.length]);
    };
    setPresence();
    setInterval(setPresence, 15_000);
  });
};