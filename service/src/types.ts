export interface GitCredentials {
  username: string;
  token: string;
}

export interface ImageTarget {
  registry: string;
  name: string;
  tag: string;
}

export interface BuildRequest {
  repository: string;
  branch: string;
  gitCredentials?: GitCredentials;
  image: ImageTarget;
}

export interface BuildResponse {
  image: string;
}

export interface ErrorResponse {
  error: string;
}
