import { Module } from "@nestjs/common";
import { SPIKE_CONTROLLERS } from "./controllers.js";

/**
 * Spike API module. No providers: the spike proves topology (proxy chain,
 * cookies, Better Auth mounting), not services.
 */
@Module({
  controllers: SPIKE_CONTROLLERS,
})
export class SpikeApiModule {}
