const mongoose = require("mongoose");

const walletSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true, // Discord Username
  },
  publicKey: {
    type: String,
    required: true,
    unique: true,
  },
  privateKey: {
    type: String,
    required: true,
  },
  balance: {
    type: String,
    required: true,
  },
  fee: {
    type: Number,
    required: true,
    default: 0.0, // Set a default fee value if needed
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Wallet = mongoose.model("Wallet", walletSchema);

module.exports = Wallet;
