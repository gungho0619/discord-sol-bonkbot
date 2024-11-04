const { Client, GatewayIntentBits, Partials } = require("discord.js");
require("dotenv").config();
const connectDB = require("./config/db");
const {
  showWallet,
  createWallet,
  exportPrivateKey,
  withdrawSOL,
  setFee, // Import setFee from walletController
} = require("./controllers/walletController");

// Connect to the database
connectDB();

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers, // Allows bot to handle DMs and server messages
  ],
  partials: [Partials.Channel], // Allows bot to receive DMs
});

// Listen for messages
client.on("messageCreate", async (msg) => {
  // Ignore messages from bots
  if (msg.author.bot) return;

  const userId = msg.author.id;
  const content = msg.content.trim(); // Trim whitespace
  const isDM = !msg.guild;

  try {
    if (content.startsWith("/wallet show")) {
      await showWallet(userId, msg);
    } else if (content.startsWith("/wallet new")) {
      await createWallet(userId, msg);
    } else if (content.startsWith("/wallet export")) {
      await exportPrivateKey(userId, msg);
    } else if (content.startsWith("/wallet withdraw")) {
      const args = content.split(" ");
      const solanaWallet = args[2];
      const amount = args[3];

      if (!solanaWallet || !amount) {
        return await msg.reply("Usage: `/wallet withdraw <address> <amount>`");
      }

      await withdrawSOL(userId, solanaWallet, amount, msg);
    } else if (content.startsWith("/fee")) {
      const priorityInput = content.split(" ")[1]; // Extract the input directly
      const priorityNumber = parseFloat(priorityInput); // Attempt to parse the input as a float

      // Define a mapping for string inputs to their numerical values
      const priorityFees = {
        very_high: 0.01,
        high: 0.005,
        medium: 0.001,
      };

      // Check if the input is a valid number and greater than 0, or a valid string option
      const priorityFee =
        !isNaN(priorityNumber) && priorityNumber > 0
          ? priorityNumber
          : priorityFees[priorityInput?.toLowerCase()];

      if (priorityFee === undefined) {
        return await msg.reply(
          "Usage: `/fee <priority>` (e.g., a number or one of the following: very_high, high, medium)"
        );
      }

      await setFee(userId, priorityFee, msg); // Call setFee function with the valid priority fee
    } else if (isDM) {
      // Handle DMs with a default response for unknown commands
      await msg.reply(
        "Unknown command. Try `/wallet show`, `/wallet new`, `/wallet export`, `/wallet withdraw`, or `/fee <priority>`."
      );
    }
  } catch (error) {
    console.error("Error handling command:", error);
    await msg.reply(
      "An error occurred while processing your request. Please try again."
    );
  }
});

// Log in to Discord
client
  .login(process.env.DISCORD_TOKEN)
  .then(() => console.log("Discord client logged in."))
  .catch(console.error);
