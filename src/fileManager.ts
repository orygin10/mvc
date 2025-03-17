import { DB, sqlite3InitModule } from "./db";
import {
  S3,
  DeleteAllObjectOptions,
  DeleteObjectOptions,
  GetObjectOptions,
  PutObjectOptions,
  ListObjectsOptions,
} from "./s3";

interface ConvertToJpegOptions {
  quality?: number;
}

export async function convertToJpeg(
  file: File,
  { quality = 0.9 }: ConvertToJpegOptions,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const img = new Image();
      img.src = reader.result as string;
      img.onerror = () => reject(new Error("JPEG conversion failed"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        canvas.width = img.width;
        canvas.height = img.height;
        ctx?.drawImage(img, 0, 0);

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("JPEG conversion failed"));
          },
          "image/jpeg",
          quality,
        );
      };
    };
    reader.onerror = () => reject(new Error("JPEG conversion failed"));
  });
}

export const withLoading =
  (element: HTMLButtonElement) =>
  async <T>(fn: () => Promise<T>) => {
    element.disabled = true;
    const elementText = element.innerText;
    element.innerText = "Loading...";
    try {
      return await fn();
    } finally {
      element.disabled = false;
      element.innerText = elementText;
    }
  };

export interface FileManagerOptions {
  s3: () => Promise<S3>;
  bucket: string;
}

export class FileManager {
  constructor(private options: FileManagerOptions) {}

  async uploadImage(
    file: File,
    {
      quality,
      ...options
    }: ConvertToJpegOptions &
      Pick<PutObjectOptions, "key" | "cacheControl" | "maxSize">,
  ) {
    const jpegBlob = await convertToJpeg(file, { quality });
    const fileBytes = new Uint8Array(await jpegBlob.arrayBuffer());

    const { bucket } = this.options;
    const s3 = await this.options.s3();
    await s3.putObject({
      bucket,
      fileBytes,
      contentType: "image/jpeg",
      ...options,
    });
  }

  async uploadFile(
    file: File,
    options: Pick<PutObjectOptions, "key" | "cacheControl" | "maxSize">,
  ) {
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const { bucket } = this.options;
    const s3 = await this.options.s3();
    await s3.putObject({
      bucket,
      fileBytes,
      contentType: file.type,
      ...options,
    });
    console.log("File uploaded");
  }
  
  async putObject(
    fileBytes: Uint8Array,
    options: Pick<PutObjectOptions, "key" | "contentType" | "cacheControl" | "maxSize">,
  ) {
    const { bucket } = this.options;
    const s3 = await this.options.s3();
    await s3.putObject({
      bucket,
      fileBytes,
      ...options,
    });
  }

  async loadImage(
    imgElement: HTMLImageElement,
    options: Pick<GetObjectOptions, "key" | "responseCacheControl">,
  ) {
    const { bucket } = this.options;
    const s3 = await this.options.s3();
    try {
      const { Body } = await s3.getObject({
        bucket,
        ...options,
      });
      const blob = await new Response(await Body!.transformToByteArray()).blob();
      loadBlobToImage(blob, imgElement);
    } catch (error: any) {
      if (error.Code && error.Code === "NoSuchKey") {
        return;
      }
      console.error("Error loading image:", error);
    }
  }

  async downloadFile(
    options: Pick<GetObjectOptions, "key" | "responseCacheControl">,
  ) {
    const { bucket } = this.options;
    const s3 = await this.options.s3();
    try {
      const { Body } = await s3.getObject({
        bucket,
        ...options,
      });
      const blob = await new Response(await Body!.transformToByteArray()).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = options.key;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading file:", error);
    }
  }
  
  async getObject(
    options: Pick<GetObjectOptions, "key" | "responseCacheControl">,
  ) {
    const { bucket } = this.options;
    const s3 = await this.options.s3();
    const { Body, ContentType } = await s3.getObject({
      bucket,
      ...options,
    });

    return { contentType: ContentType, content: await Body!.transformToByteArray() };
  }

  async openFile(
    options: Pick<GetObjectOptions, "key" | "responseCacheControl">,
  ) {
    const { contentType, content } = await this.getObject(options);
    const blob = new Blob([await new Response(content).arrayBuffer()], {
      type: contentType,
    });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }

  async deleteAllObjects(
    options?: Pick<DeleteAllObjectOptions, "prefix">,
  ) {
    const { bucket } = this.options;
    const s3 = await this.options.s3();
    return await s3.deleteAllObjects({ bucket, ...options });
  }
  
  async listObjects(
    options?: Pick<ListObjectsOptions, "prefix">,
  ) {
    const { bucket } = this.options;
    const s3 = await this.options.s3();
    return await s3.listObjects({ bucket, ...options });
  }

  async deleteObject(options: Pick<DeleteObjectOptions, "key">) {
    const { bucket } = this.options;
    const s3 = await this.options.s3();
    return await s3.deleteObject({ bucket, ...options });
  }
}

function loadBlobToImage(blob: Blob, img: HTMLImageElement) {
  const url = URL.createObjectURL(blob);
  img.src = url;
  img.onload = () => {
    // URL.revokeObjectURL(url);
    if (img.style.display === "none") {
      img.style.removeProperty("display");
    }
  };
}