export class DataIngestionEngine {
  constructor(private resolution: any, private crud: any) {}
  
  async runPipeline() {
    console.log("Ingestion Pipeline Triggered");
  }
}