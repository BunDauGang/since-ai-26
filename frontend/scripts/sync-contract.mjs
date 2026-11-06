// Copies the shared contract sample into the frontend bundle (run after the Lead updates contracts/).
import { copyFileSync } from "node:fs";
copyFileSync(new URL("../../contracts/sample_review.json", import.meta.url), new URL("../src/data/sample_review.json", import.meta.url));
console.log("Synced contracts/sample_review.json → src/data/sample_review.json");
