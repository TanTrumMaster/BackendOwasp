const mongoose = require('mongoose');

const repositorySchema = new mongoose.Schema({
  repositoryUrl: {
    type: String,
    required: true,
  },
  warnings: [
    {
      type: String,
      required: true,
    },
  ],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Repository = mongoose.model('Repository', repositorySchema);

module.exports = Repository;
