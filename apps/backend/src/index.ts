import "dotenv/config";
import { app } from "./app";
import { logger } from "./utils/logger";

const port = process.env.PORT || 3001;

app.listen(port, () => {
  logger.info(`Backend running on port ${port}`);
});