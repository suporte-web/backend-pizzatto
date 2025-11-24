// interface/fileResponse.interface.ts
export interface FileResponse {
  filename: string;
  originalName: string;
  path: string;
  size: number;
  mimetype: string;
  uploadDate: Date;
  folder?: string; // Adicione esta linha
}

export interface FileListResponse {
  success: boolean;
  files: FileResponse[];
  total: number;
  folder?: string; // Adicione esta linha
}

export interface DownloadData {
  stream: any;
  filename: string;
  originalName: string;
  mimetype: string;
  folder?: string; // Adicione esta linha
}

export interface DownloadResponse {
  success: boolean;
  data?: DownloadData;
}