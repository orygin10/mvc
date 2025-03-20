import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import pako from "pako";

const MAX_BINARY_SIZE = 1024 * 400; // 400KB

async function compressAndUpload(
  dynamo: DynamoDBClient,
  buffer: ArrayBuffer,
  tableName: string,
  key: Record<string, string>,
  metadata: Record<string, string>,
) {
  const compressed = pako.gzip(new Uint8Array(buffer));

  let binaryString = "";
  compressed.forEach((byte) => (binaryString += String.fromCharCode(byte)));
  const compressedBase64 = btoa(binaryString);
  console.log("Compressed size:", compressedBase64.length);
  if (compressedBase64.length > MAX_BINARY_SIZE) {
    throw new Error("Data exceeds maximum size");
  }

  await dynamo.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        ...Object.entries({ ...key, ...metadata }).reduce(
          (acc, [key, value]) => ({ ...acc, [key]: { S: value } }),
          {},
        ),
        data: { S: compressedBase64 },
      },
    }),
  );
}

async function downloadAndDecompress(
  dynamo: DynamoDBClient,
  tableName: string,
  key: Record<string, string>,
): Promise<ArrayBuffer> {
  const response = await dynamo.send(
    new GetItemCommand({
      TableName: tableName,
      Key: Object.entries(key).reduce(
        (acc, [key, value]) => ({ ...acc, [key]: { S: value } }),
        {},
      ),
    }),
  );

  if (!response.Item || !response.Item.data) {
    throw new Error("Data not found");
  }

  const binaryString = atob(response.Item.data.S as string);
  const compressed = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    compressed[i] = binaryString.charCodeAt(i);
  }

  const decompressed = pako.ungzip(compressed);

  return decompressed.buffer;
}

export class Dynamo {
  constructor(
    private readonly client: DynamoDBClient,
    private dynamoTable: string,
    private readonly key: Record<string, string>,
    private readonly metadata: Record<string, string>,
    
  ) {}

  async compressAndUpload(buffer: ArrayBuffer) {
    await compressAndUpload(this.client, buffer, this.dynamoTable, this.key, this.metadata);
  }

  async downloadAndDecompress(): Promise<ArrayBuffer> {
    return downloadAndDecompress(this.client, this.dynamoTable, this.key);
  }
}
