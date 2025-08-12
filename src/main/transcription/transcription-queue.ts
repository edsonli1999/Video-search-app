import { EventEmitter } from 'events';

export interface TranscriptionJob {
  id: string;
  videoId: number;
  videoPath: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  priority: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  progress?: number;
  stage?: string;
}

export interface QueueStatus {
  totalJobs: number;
  queuedJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
}

export class TranscriptionQueue extends EventEmitter {
  private queue: TranscriptionJob[] = [];
  private processing: TranscriptionJob | null = null;
  private isProcessing = false;
  private jobCounter = 0;

  constructor() {
    super();
  }

  /**
   * Add a video to the transcription queue
   */
  addJob(videoId: number, videoPath: string, priority: number = 0): string {
    const jobId = `job_${++this.jobCounter}_${Date.now()}`;
    
    const job: TranscriptionJob = {
      id: jobId,
      videoId,
      videoPath,
      status: 'queued',
      priority,
      createdAt: new Date()
    };

    // Insert job based on priority (higher priority first)
    const insertIndex = this.queue.findIndex(j => j.priority < priority);
    if (insertIndex === -1) {
      this.queue.push(job);
    } else {
      this.queue.splice(insertIndex, 0, job);
    }

    console.log(`📋 Added transcription job ${jobId} for video ${videoId} (priority: ${priority})`);
    this.emit('jobAdded', job);
    this.emit('queueUpdated', this.getStatus());

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processNextJob();
    }

    return jobId;
  }

  /**
   * Remove a job from the queue
   */
  removeJob(jobId: string): boolean {
    const index = this.queue.findIndex(job => job.id === jobId);
    if (index !== -1) {
      const removedJob = this.queue.splice(index, 1)[0];
      console.log(`🗑️ Removed transcription job ${jobId}`);
      this.emit('jobRemoved', removedJob);
      this.emit('queueUpdated', this.getStatus());
      return true;
    }
    return false;
  }

  /**
   * Get job status
   */
  getJobStatus(jobId: string): TranscriptionJob | null {
    // Check processing job
    if (this.processing && this.processing.id === jobId) {
      return this.processing;
    }

    // Check queued jobs
    return this.queue.find(job => job.id === jobId) || null;
  }

  /**
   * Get all jobs
   */
  getAllJobs(): TranscriptionJob[] {
    const allJobs = [...this.queue];
    if (this.processing) {
      allJobs.push(this.processing);
    }
    return allJobs;
  }

  /**
   * Get queue status
   */
  getStatus(): QueueStatus {
    const allJobs = this.getAllJobs();
    
    return {
      totalJobs: allJobs.length,
      queuedJobs: allJobs.filter(job => job.status === 'queued').length,
      processingJobs: allJobs.filter(job => job.status === 'processing').length,
      completedJobs: allJobs.filter(job => job.status === 'completed').length,
      failedJobs: allJobs.filter(job => job.status === 'failed').length
    };
  }

  /**
   * Clear completed jobs
   */
  clearCompletedJobs(): number {
    const initialLength = this.queue.length;
    this.queue = this.queue.filter(job => job.status !== 'completed');
    const removedCount = initialLength - this.queue.length;
    
    if (removedCount > 0) {
      console.log(`🧹 Cleared ${removedCount} completed transcription jobs`);
      this.emit('queueUpdated', this.getStatus());
    }
    
    return removedCount;
  }

  /**
   * Clear all jobs
   */
  clearAllJobs(): number {
    const count = this.queue.length;
    this.queue = [];
    this.processing = null;
    this.isProcessing = false;
    
    console.log(`🧹 Cleared all transcription jobs (${count} jobs)`);
    this.emit('queueCleared');
    this.emit('queueUpdated', this.getStatus());
    
    return count;
  }

  /**
   * Process the next job in the queue
   */
  private async processNextJob(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const job = this.queue.shift()!;
    this.processing = job;
    
    job.status = 'processing';
    job.startedAt = new Date();
    
    console.log(`🔄 Processing transcription job ${job.id} for video ${job.videoId}`);
    this.emit('jobStarted', job);
    this.emit('queueUpdated', this.getStatus());

    try {
      // Emit progress updates
      this.emit('jobProgress', {
        jobId: job.id,
        videoId: job.videoId,
        progress: 0,
        stage: 'starting'
      });

      // The actual transcription will be handled by the transcription orchestrator
      // This queue just manages the job lifecycle
      
      // For now, we'll just mark it as completed
      // In the real implementation, this would call the transcription orchestrator
      job.status = 'completed';
      job.completedAt = new Date();
      job.progress = 100;
      job.stage = 'completed';
      
      console.log(`✅ Completed transcription job ${job.id} for video ${job.videoId}`);
      this.emit('jobCompleted', job);
      
    } catch (error) {
      job.status = 'failed';
      job.completedAt = new Date();
      job.error = error instanceof Error ? error.message : String(error);
      
      console.error(`❌ Failed transcription job ${job.id} for video ${job.videoId}:`, error);
      this.emit('jobFailed', job);
    } finally {
      this.processing = null;
      this.isProcessing = false;
      this.emit('queueUpdated', this.getStatus());
      
      // Process next job if available
      if (this.queue.length > 0) {
        setTimeout(() => this.processNextJob(), 100);
      }
    }
  }

  /**
   * Update job progress
   */
  updateJobProgress(jobId: string, progress: number, stage: string): void {
    const job = this.getJobStatus(jobId);
    if (job) {
      job.progress = progress;
      job.stage = stage;
      
      this.emit('jobProgress', {
        jobId: job.id,
        videoId: job.videoId,
        progress,
        stage
      });
    }
  }

  /**
   * Pause queue processing
   */
  pause(): void {
    this.isProcessing = false;
    console.log('⏸️ Transcription queue paused');
    this.emit('queuePaused');
  }

  /**
   * Resume queue processing
   */
  resume(): void {
    if (!this.isProcessing && this.queue.length > 0) {
      this.processNextJob();
    }
    console.log('▶️ Transcription queue resumed');
    this.emit('queueResumed');
  }

  /**
   * Get queue statistics
   */
  getStatistics(): {
    totalProcessed: number;
    averageProcessingTime: number;
    successRate: number;
  } {
    const allJobs = this.getAllJobs();
    const completedJobs = allJobs.filter(job => job.status === 'completed');
    const failedJobs = allJobs.filter(job => job.status === 'failed');
    
    const totalProcessed = completedJobs.length + failedJobs.length;
    const successRate = totalProcessed > 0 ? completedJobs.length / totalProcessed : 0;
    
    let totalProcessingTime = 0;
    let validJobs = 0;
    
    [...completedJobs, ...failedJobs].forEach(job => {
      if (job.startedAt && job.completedAt) {
        totalProcessingTime += job.completedAt.getTime() - job.startedAt.getTime();
        validJobs++;
      }
    });
    
    const averageProcessingTime = validJobs > 0 ? totalProcessingTime / validJobs : 0;
    
    return {
      totalProcessed,
      averageProcessingTime,
      successRate
    };
  }
} 