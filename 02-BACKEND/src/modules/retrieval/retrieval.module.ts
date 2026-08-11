import { Module } from '@nestjs/common';
import { RETRIEVAL_CLIENT_PORT } from './ports/retrieval-client.port';
import { RetrievalHttpClientService } from './services/retrieval-http-client.service';
import { RetrievalService } from './services/retrieval.service';

@Module({
  providers: [
    RetrievalService,
    RetrievalHttpClientService,
    { provide: RETRIEVAL_CLIENT_PORT, useExisting: RetrievalHttpClientService },
  ],
  exports: [RetrievalService],
})
export class RetrievalModule {}
