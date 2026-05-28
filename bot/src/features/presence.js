// 谢谢 AC0xRPFS001，这里是 AC 的代码

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

  client.once("ready", () => {
    const setPresence = () => {
      if (client.user) {
        client.user.setActivity(randomUpper("froggy"), presence.next().value);
      }
    };
    setPresence();
    setInterval(setPresence, 15_000);
  });
};

