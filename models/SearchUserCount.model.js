import mongoose from "mongoose";

const searchUserCountSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  count: {
    type: Number,
    default: 1,
    min: 0,
  },
  lastSearched: {
    type: Date,
    default: Date.now,
  },
});

const SearchUserCount = mongoose.model(
  "SearchUserCount",
  searchUserCountSchema,
  "searchusercounts"
);

export default SearchUserCount;
