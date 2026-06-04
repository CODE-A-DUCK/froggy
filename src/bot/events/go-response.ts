import { Events, Client } from "discord.js";

const replies = [
  "能陪我組一輩子的樂隊嗎？",
  "為什麼……為什麼要演奏春日影！",
  "我……從來沒覺得……玩樂隊開心過。",
  "你這個人，滿腦子都只想到自己呢。",
  "只要是我能做的，我什麼都願意做。",
];

export function setupGoResponse(client: Client) {
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !client.user) return;

    if (message.mentions.users.has(client.user.id)) {
      const randomReply = replies[Math.floor(Math.random() * replies.length)];
      try {
        await message.reply(randomReply);
      } catch (err) {
        console.error(err);
      }
    }
  });
}
