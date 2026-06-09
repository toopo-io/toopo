/**
 * Wires the read-only Serve API (ADR-0020 Phase C). The thick view logic lives
 * in @toopo/serve's GraphViewService; here it is built from the GRAPH_REPOSITORY
 * the global DatabaseModule provides, and exposed via the thin GraphController.
 */
import { Module } from '@nestjs/common';
import { type GraphRepository } from '@toopo/db';
import { GraphViewService } from '@toopo/serve';
import { GRAPH_REPOSITORY } from '../database/database.module';
import { GraphController } from './graph.controller';

@Module({
  controllers: [GraphController],
  providers: [
    {
      provide: GraphViewService,
      useFactory: (repository: GraphRepository): GraphViewService =>
        new GraphViewService(repository),
      inject: [GRAPH_REPOSITORY],
    },
  ],
})
export class GraphModule {}
