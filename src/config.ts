import "dotenv/config";

const token = process.env.TOKEN;
if (!token) {
  console.error("[Config] TOKEN is not set. Exiting.");
  process.exit(1);
}

export const config = {
  token,
};
