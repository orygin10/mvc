import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

export interface PutObjectOptions {
  bucket: string;
  key: string;
  fileBytes: Uint8Array;
  contentType: string;
  cacheControl?: string;
  maxSize?: number;
}

export interface GetObjectOptions {
  bucket: string;
  key: string;
  responseCacheControl?: string;
}

export interface DeleteObjectOptions {
  bucket: string;
  key: string;
}

export interface DeleteAllObjectOptions {
  bucket: string;
  prefix?: string;
}

export interface ListObjectsOptions {
  bucket: string;
  prefix?: string;
}

export class S3 {
  constructor(
    private client: S3Client,
    private basePrefix: string,
  ) {}

  async putObject({
    maxSize,
    fileBytes,
    cacheControl,
    contentType,
    bucket,
    key,
  }: PutObjectOptions) {
    const { basePrefix } = this;
    if (maxSize && fileBytes.length > maxSize) {
      throw new Error("File size exceeds maximum allowed");
    }
    return await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `${basePrefix}/${key}`,
        Body: fileBytes,
        CacheControl: cacheControl,
        ContentType: contentType,
      }),
    );
  }

  async getObject({ bucket, key, responseCacheControl }: GetObjectOptions) {
    const { basePrefix } = this;
    return await this.client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: `${basePrefix}/${key}`,
        ResponseCacheControl: responseCacheControl,
      }),
    );
  }

  async listObjects({ bucket, prefix }: ListObjectsOptions) {
    const { basePrefix } = this;
    return await this.client.send(
      new ListObjectsCommand({
        Bucket: bucket,
        Prefix: prefix ? `${basePrefix}/${prefix}` : `${basePrefix}`,
      }),
    );
  }

  async deleteAllObjects({ bucket, prefix }: DeleteAllObjectOptions) {
    const objects = await this.listObjects({ bucket, prefix });
    if (objects.Contents === undefined) {
      return;
    }
    return await this.client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: objects.Contents.map(({ Key }) => ({ Key })) },
      }),
    );
  }

  async deleteObject({ bucket, key }: DeleteObjectOptions) {
    const { basePrefix } = this;
    return await this.client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: `${basePrefix}/${key}` }),
    );
  }
}