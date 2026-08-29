import { Module } from '@nestjs/common';
import { AssessmentSafetyLifecycleService } from './services/assessment-safety-lifecycle.service';

@Module({
  providers: [AssessmentSafetyLifecycleService],
  exports: [AssessmentSafetyLifecycleService],
})
export class AssessmentSafetyLifecycleModule {}
