// The vetted embedding models. Everything needed to download and run each one
// is pinned here: repo, commit, every file's size and sha256, how to pool the
// output and which prefixes the model was trained with. Nothing outside this
// list can be downloaded or loaded.

export type ModelFile = { path: string; size: number; sha256: string }

export type EmbeddingModel = {
  id: string
  label: string
  purpose: string
  repo: string
  revision: string
  dims: number
  pooling: "cls" | "mean"
  queryPrefix: string
  passagePrefix: string
  license: string
  builtIn?: true
  files: ModelFile[]
}

export const BUILTIN_MODEL_ID = "bge-small-en-v1.5"

export const EMBEDDING_MODELS: EmbeddingModel[] = [
  {
    id: "bge-small-en-v1.5",
    label: "BGE small (English)",
    purpose: "Fast, good for English. Built in.",
    repo: "Xenova/bge-small-en-v1.5",
    revision: "ea104dacec62c0de699686887e3f920caeb4f3e3",
    dims: 384,
    pooling: "cls",
    queryPrefix: "Represent this sentence for searching relevant passages: ",
    passagePrefix: "",
    license: "MIT",
    builtIn: true,
    files: [
      { path: "config.json", size: 683, sha256: "fa73f90bf92c8cace1fbcb709626306f2bdbc9ea3e5b5f94b440df9b6aa56350" },
      { path: "tokenizer.json", size: 711396, sha256: "d241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66" },
      { path: "tokenizer_config.json", size: 366, sha256: "9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3" },
      { path: "special_tokens_map.json", size: 125, sha256: "b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3" },
      { path: "onnx/model_quantized.onnx", size: 34014426, sha256: "6c9c6101a956d62dfb5e7190c538226c0c5bb9cb27b651234b6df063ee7dbfe4" },
    ],
  },
  {
    id: "bge-base-en-v1.5",
    label: "BGE base (English)",
    purpose: "Better quality for English, about 3× slower.",
    repo: "Xenova/bge-base-en-v1.5",
    revision: "4d6cd88e18e51a5e020c2c305726d76ada9c03cf",
    dims: 768,
    pooling: "cls",
    queryPrefix: "Represent this sentence for searching relevant passages: ",
    passagePrefix: "",
    license: "MIT",
    files: [
      { path: "config.json", size: 717, sha256: "d83c21fa7366994560727112ef0a31d8a2ec1c280c2a3e66326fdb877f64c91e" },
      { path: "tokenizer.json", size: 711396, sha256: "d241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66" },
      { path: "tokenizer_config.json", size: 366, sha256: "9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3" },
      { path: "special_tokens_map.json", size: 125, sha256: "b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3" },
      { path: "onnx/model_quantized.onnx", size: 110083337, sha256: "c9729cc84cbd0e9fecc759505d2be65916c9fe05222d7ea26c65fcb3382af38d" },
    ],
  },
  {
    id: "snowflake-arctic-embed-m-v1.5",
    label: "Arctic Embed M (English)",
    purpose: "Best quality for its size, English. Recommended upgrade.",
    repo: "Snowflake/snowflake-arctic-embed-m-v1.5",
    revision: "e58a8f756156a1293d763f17e3aae643474e9b8a",
    dims: 768,
    pooling: "cls",
    queryPrefix: "Represent this sentence for searching relevant passages: ",
    passagePrefix: "",
    license: "Apache-2.0",
    files: [
      { path: "config.json", size: 772, sha256: "d2dddc06af0aeeb7fd3289a3dee1ac76dce0c3df2467cadd26f5f731f8d7919b" },
      { path: "tokenizer.json", size: 711649, sha256: "91f1def9b9391fdabe028cd3f3fcc4efd34e5d1f08c3bf2de513ebb5911a1854" },
      { path: "tokenizer_config.json", size: 1381, sha256: "0e83e9d7206b3ade43f8f2aeef523cf5d5b4a25b67af21b273de21972c0f58b7" },
      { path: "special_tokens_map.json", size: 695, sha256: "5d5b662e421ea9fac075174bb0688ee0d9431699900b90662acd44b2a350503a" },
      { path: "onnx/model_quantized.onnx", size: 110145162, sha256: "a18f437b2466863901a0bdc14904cf93246f5ecce0b656fc773bc2b7b2f84f6e" },
    ],
  },
  {
    id: "nomic-embed-text-v1.5",
    label: "Nomic Embed Text (English)",
    purpose: "Good quality for English; a little larger.",
    repo: "nomic-ai/nomic-embed-text-v1.5",
    revision: "e9b6763023c676ca8431644204f50c2b100d9aab",
    dims: 768,
    pooling: "mean",
    queryPrefix: "search_query: ",
    passagePrefix: "search_document: ",
    license: "Apache-2.0",
    files: [
      { path: "config.json", size: 2538, sha256: "9ab00bd92cee80a569f708140b7b6c1661a65891ff3765b1519e181ba2f2c92b" },
      { path: "tokenizer.json", size: 711396, sha256: "d241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66" },
      { path: "tokenizer_config.json", size: 1191, sha256: "d7e0000bcc80134debd2222220427e6bf5fa20a669f40a0d0d1409cc18e0a9bc" },
      { path: "special_tokens_map.json", size: 695, sha256: "5d5b662e421ea9fac075174bb0688ee0d9431699900b90662acd44b2a350503a" },
      { path: "onnx/model_quantized.onnx", size: 137296292, sha256: "b4342336debaea79de872370664b0aaeb67dea4605513d00ee236ea871a81f27" },
    ],
  },
  {
    id: "multilingual-e5-base",
    label: "E5 base (many languages)",
    purpose: "For documents in languages other than English.",
    repo: "Xenova/multilingual-e5-base",
    revision: "1ec9243030a27d1a115d5c340572074c125b58b2",
    dims: 768,
    pooling: "mean",
    queryPrefix: "query: ",
    passagePrefix: "passage: ",
    license: "MIT",
    files: [
      { path: "config.json", size: 686, sha256: "4c27930e59106027abab56f7531c1fa6b14bbf31e8229ec36d68affa4e869bcd" },
      { path: "tokenizer.json", size: 17082660, sha256: "62c24cdc13d4c9952d63718d6c9fa4c287974249e16b7ade6d5a85e7bbb75626" },
      { path: "tokenizer_config.json", size: 418, sha256: "efb5c0d09722e5fe59a462cd2a9976ee216d55b037597d997cd3fe833216da15" },
      { path: "special_tokens_map.json", size: 280, sha256: "06e405a36dfe4b9604f484f6a1e619af1a7f7d09e34a8555eb0b77b66318067f" },
      { path: "onnx/model_quantized.onnx", size: 278647662, sha256: "df7a9a29309e3ad491e1783adf8baee710262cc06079c7cbab63c630277fac94" },
    ],
  },
  {
    id: "bge-large-en-v1.5",
    label: "BGE large (English)",
    purpose: "Highest quality, slow on small hosts.",
    repo: "Xenova/bge-large-en-v1.5",
    revision: "dfeef6070b90658e1b391a6940efdb0925c1de6f",
    dims: 1024,
    pooling: "cls",
    queryPrefix: "Represent this sentence for searching relevant passages: ",
    passagePrefix: "",
    license: "MIT",
    files: [
      { path: "config.json", size: 719, sha256: "7bd757258c7418221da95ff1853bae50ef5d1bee3e8c01a96611243a52aa7299" },
      { path: "tokenizer.json", size: 711396, sha256: "d241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66" },
      { path: "tokenizer_config.json", size: 366, sha256: "9261e7d79b44c8195c1cada2b453e55b00aeb81e907a6664974b4d7776172ab3" },
      { path: "special_tokens_map.json", size: 125, sha256: "b6d346be366a7d1d48332dbc9fdf3bf8960b5d879522b7799ddba59e76237ee3" },
      { path: "onnx/model_quantized.onnx", size: 336983162, sha256: "4842b56e233be1cc74770f57f63b1ebb6cf357cca3dd73fcdec35c019f8a5d6e" },
    ],
  },
]

export function modelById(id: string): EmbeddingModel | null {
  return EMBEDDING_MODELS.find((m) => m.id === id) ?? null
}

/** Identifies the vectors a model produces; a new revision means new vectors. */
export function modelKey(m: EmbeddingModel): string {
  return `${m.id}@${m.revision}`
}

export function modelSize(m: EmbeddingModel): number {
  return m.files.reduce((n, f) => n + f.size, 0)
}
