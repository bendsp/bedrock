import "katex/dist/katex.min.css";
import "./index.css";

import { initializeRendererTelemetry } from "./observability";
import "./app";

void initializeRendererTelemetry();
