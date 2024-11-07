require("dotenv").config();
const axios = require("axios");
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
  VersionedTransaction,
} = require("@solana/web3.js");

const {
  getTokenInfo,
  getTokenPrice,
  getTokenInfo2,
} = require("../config/getData");

const connection = new Connection(
  process.env.QUIKNODE_RPC || "https://api.devnet.solana.com",
  "confirmed"
);

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

const showTokenPortfolio = asyncHandler(
  async (userId, tokenAddress, message) => {
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return await message.reply(
        "No wallet found. Please create one using `/wallet new`."
      );
    }

    try {
      // Fetch token information, price data, and additional info in parallel
      const [info, price, info2] = await Promise.all([
        getTokenInfo(tokenAddress),
        getTokenPrice(tokenAddress),
        getTokenInfo2(tokenAddress),
      ]);

      // Ensure data from all requests is available
      if (!(info?.data && price?.data && info2?.data)) {
        return await sendDM(
          message,
          `No information found for token at address: ${tokenAddress}`
        );
      }

      // Destructure token data with default values
      const {
        name = "Unknown Token",
        symbol = "N/A",
        address = tokenAddress,
      } = info.data;
      const {
        price: currentPrice,
        price5m,
        price1h,
        price6h,
        price24h,
      } = price.data;
      const { totalSupply = "N/A", mcap = "N/A", fdv = "N/A" } = info2.data;

      // Helper function to calculate percentage change
      const calcPercentChange = (oldPrice) =>
        oldPrice
          ? (((currentPrice - oldPrice) / oldPrice) * 100).toFixed(2)
          : "N/A";

      // Helper function to format large numbers (e.g., market cap)
      const formatLargeNumber = (num) => {
        if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
        if (num >= 1e3) return (num / 1e3).toFixed(2) + "K";
        return num.toFixed(2);
      };

      // Format the price and market cap
      const formattedPrice = currentPrice.toFixed(8);
      const formattedMcap = mcap !== "N/A" ? formatLargeNumber(mcap) : "N/A";
      const formattedFDV = fdv !== "N/A" ? formatLargeNumber(fdv) : "N/A";

      // Calculate percentage changes for each interval
      const percentChange5m = calcPercentChange(price5m);
      const percentChange1h = calcPercentChange(price1h);
      const percentChange6h = calcPercentChange(price6h);
      const percentChange24h = calcPercentChange(price24h);

      // Construct the response message
      const msg = [
        `**Token Portfolio:**`,
        `Token: **${name}** (**${symbol}**)`,
        `Address: **${address}**`,
        `Price: **$${formattedPrice}**`,
        `5m: **${percentChange5m}%** 1h: **${percentChange1h}%** 6h: **${percentChange6h}%** 24h: **${percentChange24h}%**`,
        `Market Cap: **$${formattedMcap}** FDV: **$${formattedFDV}**`,
        `Wallet Balance: ${wallet.balance} SOL`,
      ].join("\n");

      // Send the token info to the user
      await sendDM(message, msg);
    } catch (error) {
      console.error("Error fetching token information:", error);
      await sendDM(
        message,
        "An error occurred while retrieving the token information. Please try again later."
      );
    }
  }
);

const swapToken = asyncHandler(
  async (userId, inputMint, outputMint, amount, slippageBps, message) => {
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return await sendDM(
        message,
        "No wallet found. Please create one using `/wallet new`."
      );
    }

    try {

      await sendDM(message, `🔄 Starting swap transaction...
        Input Token: ${inputMint}
        Output Token: ${outputMint} 
        Amount: ${amount} SOL
        Slippage: ${slippageBps/100}%`);

      const publicKey = new PublicKey(wallet.publicKey);
      const privateKey = Uint8Array.from(JSON.parse(wallet.privateKey));
      const userWallet = Keypair.fromSecretKey(new Uint8Array(privateKey));

      // Fetch quote from Jupiter Aggregator API
      const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${
        amount * LAMPORTS_PER_SOL
      }&slippageBps=${slippageBps}`;
      const quoteResponse = await (await fetch(quoteUrl)).json();

      await sendDM(message, `🔄 Quote retrieved: ${JSON.stringify(quoteResponse)}`);

      if (!quoteResponse) {
        return await sendDM(
          message,
          "Could not retrieve a quote for the swap. Please try again later."
        );
      }

      // Get the serialized transaction for the swap
      const swapResponse = await (
        await fetch("https://quote-api.jup.ag/v6/swap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quoteResponse,
            userPublicKey: publicKey.toString(),
            wrapAndUnwrapSol: true,
          }),
        })
      ).json();

      await sendDM(message, `🔄 Swap transaction retrieved: ${JSON.stringify(swapResponse)}`);

      if (!swapResponse.swapTransaction) {
        return await sendDM(
          message,
          "Swap transaction could not be retrieved. Please try again later."
        );
      }

      // Deserialize the transaction
      const swapTransactionBuf = Buffer.from(
        swapResponse.swapTransaction,
        "base64"
      );
      let transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      transaction.sign([userWallet]);

      await sendDM(message, `🔄 Transaction signed: ${JSON.stringify(transaction)}`);

      // Execute the transaction
      const rawTransaction = transaction.serialize();
      const txid = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries: 2,
      });

      await sendDM(message, `🔄 Transaction sent: ${txid}`);

      await connection.getSignatureStatus(txid);

      await sendDM(
        message,
        `Transaction successful! Swap completed with txid: https://solscan.io/tx/${txid}`
      );
    } catch (error) {
      console.error("Error during token swap transaction:", error);
      await sendDM(
        message,
        "An error occurred while processing your token swap."
      );
    }
  }
);

module.exports = {
  showWallet,
  createWallet,
  exportPrivateKey,
  withdrawSOL,
  setFee,
  showTokenPortfolio,
  swapToken,
};
