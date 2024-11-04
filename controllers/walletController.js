const asyncHandler = require("express-async-handler");
const Wallet = require("../models/walletModel");
const {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
  SystemProgram,
  PublicKey,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

// Helper function to send DM response
const sendDM = async (message, content) => {
  try {
    await message.author.send(content);
  } catch (error) {
    console.error("Could not send DM:", error);
    await message.reply(
      "I couldn't send you a DM. Please check your privacy settings."
    );
  }
};

// Show Wallet
const showWallet = asyncHandler(async (userId, message) => {
  const wallet = await Wallet.findOne({ userId });

  if (!wallet) {
    return await sendDM(
      message,
      "No wallet found. Please create one using `/wallet new`."
    );
  }

  try {
    const publicKey = new PublicKey(wallet.publicKey);

    // Fetch balance from Solana network and convert to SOL
    const balanceLamports = await connection.getBalance(publicKey);
    const balanceSOL = (balanceLamports / LAMPORTS_PER_SOL).toFixed(4);

    // Update and save the new balance if it has changed
    if (balanceSOL !== wallet.balance) {
      wallet.balance = balanceSOL;
      await wallet.save();
    }

    // Send balance info to the user
    await sendDM(
      message,
      `Hey @${message.author.username}, here’s your wallet info:\nPublic Key: \`${wallet.publicKey}\`\nBalance: ${balanceSOL} SOL`
    );
  } catch (error) {
    console.error("Error fetching balance:", error);
    await sendDM(
      message,
      "An error occurred while fetching your wallet balance. Please try again later."
    );
  }
});

// Create Wallet
const createWallet = asyncHandler(async (userId, message) => {
  const existingWallet = await Wallet.findOne({ userId });

  if (existingWallet) {
    return await sendDM(message, "You already have a wallet.");
  }

  const newWallet = Keypair.generate();
  const walletData = new Wallet({
    userId,
    publicKey: newWallet.publicKey.toString(),
    privateKey: JSON.stringify(Array.from(newWallet.secretKey)),
    balance: "0",
  });

  await walletData.save();
  await sendDM(
    message,
    `Hey @${
      message.author.username
    }, your new wallet has been created!\nPublic Key: \`${newWallet.publicKey.toString()}\``
  );
});

// Export Wallet PrivateKey
const exportPrivateKey = asyncHandler(async (userId, message) => {
  const wallet = await Wallet.findOne({ userId });

  if (!wallet) {
    return await sendDM(
      message,
      "No wallet found. Please create one using `/wallet new`."
    );
  }

  try {
    const privateKeyArray = JSON.parse(wallet.privateKey);
    const privateKeyHex = Buffer.from(privateKeyArray).toString("hex");

    await sendDM(
      message,
      `Hey @${message.author.username}, your Private Key: \`${privateKeyHex}\``
    );
  } catch (error) {
    console.error("Error parsing private key:", error);
    await sendDM(
      message,
      "An error occurred while retrieving your private key. Please try again."
    );
  }
});

// Withdraw SOL
const withdrawSOL = asyncHandler(
  async (userId, solanaWallet, amount, message) => {
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return await sendDM(
        message,
        "No wallet found. Please create one using `/wallet new`."
      );
    }

    const balance = parseFloat(wallet.balance);
    const withdrawAmount = parseFloat(amount);

    if (withdrawAmount > balance) {
      return await sendDM(message, "Insufficient balance.");
    }

    let toPublicKey;
    try {
      toPublicKey = new PublicKey(solanaWallet);
    } catch (error) {
      console.log("error", error);
      return await sendDM(message, "Invalid Solana wallet address.");
    }
    const privateKey = Uint8Array.from(JSON.parse(wallet.privateKey));
    const fromWallet = Keypair.fromSecretKey(new Uint8Array(privateKey));

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromWallet.publicKey,
        toPubkey: toPublicKey,
        lamports: withdrawAmount * LAMPORTS_PER_SOL,
      })
    );

    try {
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [fromWallet]
      );
      // Update wallet balance
      wallet.balance = (balance - withdrawAmount).toString();
      await wallet.save();

      await sendDM(
        message,
        `Hey @${message.author.username}, successfully withdrew ${amount} SOL to ${solanaWallet}.`
      );
    } catch (error) {
      console.error("Error during withdrawal:", error);
      await sendDM(
        message,
        "An error occurred while processing your withdrawal."
      );
    }
  }
);

// Set Fee based on priority
const setFee = asyncHandler(async (userId, priority, message) => {
  const wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    return await sendDM(
      message,
      "No wallet found. Please create one using `/wallet new`."
    );
  }

  let priorityFee;
  priorityFee = priority * LAMPORTS_PER_SOL;

  wallet.fee = priorityFee;
  await wallet.save();

  await sendDM(
    message,
    `Priority fee set to ${(priorityFee / LAMPORTS_PER_SOL).toFixed(
      4
    )} SOL based on the selected priority: "${priority}".`
  );

  return priorityFee;
});

module.exports = {
  showWallet,
  createWallet,
  exportPrivateKey,
  withdrawSOL,
  setFee,
};
