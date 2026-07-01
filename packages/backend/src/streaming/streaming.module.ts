import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GenerationModule } from '../generation/generation.module.js';
import { EvalModule } from '../eval/eval.module.js';
import { OwnershipModule } from '../ownership/ownership.module.js';
import { StreamGateway } from './streaming.gateway.js';
import { WsJwtGuard } from '../auth/guards/ws-jwt.guard.js';

@Module({
  imports: [AuthModule, GenerationModule, EvalModule, OwnershipModule],
  providers: [StreamGateway, WsJwtGuard],
})
export class StreamingModule {}
