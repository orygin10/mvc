import { AWSService, DB as VDB, sqlite3InitModule } from "./dist/index.js"
import CONFIG from "./config.json" with { type: "json" }

export const AWS = new AWSService({
  ...CONFIG['aws'],
  redirectUri: window.location.origin,
  logoutUri: window.location.origin
})

const { "bucket": DB_BUCKET, "key": DB_KEY, "dynamoTable": DB_DYNAMO_TABLE } = CONFIG['database'];

export const dbFileManager = AWS.files({ bucket: DB_BUCKET });
export const dynamoDB = AWS.dynamo({ tableName: DB_DYNAMO_TABLE });

export class DB {
  static async load() {
    if (this.inner) return;
    let dbBytes;
    try {
      dbBytes = await dynamoDB.then(ddb => ddb.downloadAndDecompress());
    } catch (error) {
      if (error.message !== "Data not found") throw new Error(error);
      console.warn("Own db not found, try default..");
      const result = await fetch("/vendor/default.sqlite")
      if (!result.ok) throw new Error("default db not found");
      dbBytes = await result.arrayBuffer();
    }
    this.sqlite3 = await sqlite3InitModule({
      print: console.log,
      printErr: console.error,
    });
    this.inner = VDB.fromArrayBuffer(this.sqlite3, dbBytes);
  }

  /**
  * 
  * @param {string} sql 
  * @param  {import('@sqlite.org/sqlite-wasm').BindingSpec} bind 
  * @returns {[key: string]: any}
  */
  static execute(sql, bind) {
    if (!this.inner) throw new Error("DB not loaded");
    return this.inner.execute(sql, bind);
  }
  
  static lastInsertRowId() {
    return this.execute("SELECT last_insert_rowid() as id")[0]['id'];
  }

  static async save() {
    if (!this.inner || !this.sqlite3) throw new Error("DB not loaded");
    const dbBytes = this.inner.toArrayBuffer(this.sqlite3);
    await dynamoDB.then(ddb => ddb.compressAndUpload(dbBytes));
  }
}

window.addEventListener('DOMContentLoaded', async() => {
  await AWS.login({ redirect: true, throw: true });
  await DB.load();
  const res = DB.execute("SELECT * FROM sqlite_master where type = ?", ["table"]);
  console.log(res);
  // await DB.save();
});
