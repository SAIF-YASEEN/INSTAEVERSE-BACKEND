import mongoose from "mongoose";

const searchTermSchema = new mongoose.Schema({
  term: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  count: {
    type: Number,
    default: 1,
  },
  lastSearched: {
    type: Date,
    default: Date.now,
  },
});

const SearchTerm = mongoose.model(
  "SearchTerm",
  searchTermSchema,
  "searchterms"
);

export default SearchTerm;
