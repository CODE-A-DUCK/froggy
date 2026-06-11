import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} from "discord.js";

import { EMOJIS } from "../../../shared/emojis.js";
import { executeVerificationCommand } from "./verification/execute.js";
import { handleVerificationButton } from "./verification/handleButton.js";
import { handleVerificationModal } from "./verification/handleModal.js";
import { VERIFICATION_METHODS } from "./verification/constants.js";

export const verificationCommand = {
  name: "verify",
  category: `${EMOJIS.LingLong} | 伺服器管理`,
  defer: true,
  ephemeral: true,
  data: new SlashCommandBuilder()
    .setName("verify")
    .setDescription("設置驗證系統")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(sub =>
      sub
        .setName("setup")
        .setDescription("在指定頻道部署驗證按鈕")
        .addChannelOption(o =>
          o
            .setName("channel")
            .setDescription("發送驗證按鈕的頻道")
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption(o =>
          o
            .setName("method")
            .setDescription("驗證方式")
            .setRequired(true)
            .addChoices(
              ...Object.entries(VERIFICATION_METHODS).map(([value, name]) => ({ name, value }))
            )
        )
        .addRoleOption(o =>
          o
            .setName("role")
            .setDescription("驗證成功後發放的身份組")
            .setRequired(true)
        )
        .addBooleanOption(o =>
          o
            .setName("kick")
            .setDescription("驗證失敗時是否踢出成員")
            .setRequired(false)
        )
    ),

  execute: executeVerificationCommand,
  handleButton: handleVerificationButton,
  handleModal: handleVerificationModal
};
