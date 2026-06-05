import { ActionRowBuilder, CheckboxGroupBuilder } from 'discord.js';
try {
  const row = new ActionRowBuilder().addComponents(new CheckboxGroupBuilder().setCustomId("test").addOptions({label: "A", value: "a"}));
  console.log("Success:", row.toJSON());
} catch(e) {
  console.log("Error:", e.message);
}
