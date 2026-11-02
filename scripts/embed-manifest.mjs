// The pinned BGE embedding model manifest, shared by
// scripts/sync-embed-runtime.mjs (download + verify) and the embed-asset
// test (CI integrity check). SHA256 entries cover every committed file at
// PINNED_REVISION (upstream lastModified 2025-07-22).
export const MODEL_ID = "Xenova/bge-small-zh-v1.5";
export const PINNED_REVISION = "75c43b069aac4d136ba6bc1122f995fedcfd2781";
export const SHA256 = {
  "config.json": "d4193ead3a810fd694fa8a31d7fc72fbaebc0668b603e398734bf2f6538ff42f",
  "quantize_config.json": "2cc488b20fa05fe86aba2fdc2be44d24827e11e2b7c7a0753d1427da6797b46f",
  "special_tokens_map.json": "b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3",
  "tokenizer.json": "48cea5d44424912a6fd1ea647bf4fe50b55ab8b1e5879c3275f80e339e8fae26",
  "tokenizer_config.json": "e6f3b96db926a37d4039995fbf5ad17de158dfb8f6343d607e4dbaad18d75f5a",
  "vocab.txt": "45bbac6b341c319adc98a532532882e91a9cefc0329aa57bac9ae761c27b291c",
  "onnx/model_quantized.onnx": "15b717c382bcb518ba457b93ea6850ede7f4f1cd8937454aa06972366cd19bcc",
};
