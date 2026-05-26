import { ActivityType } from "discord.js";

const presenceArray = [
  { type: ActivityType.Playing },
  { type: ActivityType.Listening },
  { type: ActivityType.Watching },
];

function* infArray(array) {
  let i = 0;
  while (true) {
    yield array[i++];
    i %= array.length;
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

  function startSetPresence() {
    if (!client.user) return;
    client.user.setActivity(randomUpper("froggy"), presence.next().value);
    setTimeout(startSetPresence, 15e3);
  }

  client.once("clientReady", () => {
    startSetPresence();
  });
};
