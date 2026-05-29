import { ActivityType } from "discord.js";

const presenceArray = [
  { type: ActivityType.Playing },
  { type: ActivityType.Listening },
  { type: ActivityType.Watching },
];

function* infArray(arr) {
  let i = 0;
  while (true) {
    yield arr[i++];
    i %= arr.length;
  }
}

function randomUpper(text) {
  return text
    .split("")
    .map((x) => (Math.random() > 0.5 ? x : x.toUpperCase()))
    .join("");
}

export default (client) => {
  const presence = infArray(presenceArray);
  client.once("clientReady", () => {
    const setPresence = () => {
      if (client.user)
        client.user.setActivity(randomUpper("froggy"), presence.next().value);
    };
    setPresence();
    setInterval(setPresence, 15_000);
  });
};
