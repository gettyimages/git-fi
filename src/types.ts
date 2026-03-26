export interface Options {
  debug: boolean;
  bare: boolean;
  json: boolean;
  select: boolean;
}

export interface CIResult {
  branch: string;
  status: string;
  pipelineId: string;
  author: string;
  date: string;
  branchMissing: boolean;
}
