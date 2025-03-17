import sqlite3InitModule, { BindingSpec, Database, Sqlite3Static } from '@sqlite.org/sqlite-wasm';

export { sqlite3InitModule }

export class DB {
  private constructor(private inner: Database) {}

  execute(sql: string, bind: BindingSpec) {
    return this.inner.exec({
      sql,
      bind,
      rowMode: "object",
      returnValue: "resultRows"
    });
  }
  
  static async fromUrl(sqlite3: Sqlite3Static, url: string) {
    const arrayBuffer = await fetch(url).then(res => res.arrayBuffer());
    return DB.fromArrayBuffer(sqlite3, arrayBuffer);
  }
  
  static fromArrayBuffer(sqlite3: Sqlite3Static, arrayBuffer: ArrayBuffer, immutable: boolean = false): DB {
    if (!immutable) {
        (arrayBuffer as any).resizeable = true;
    }
    const p = sqlite3.wasm.allocFromTypedArray(arrayBuffer);
    const db = new sqlite3.oo1.DB(undefined, 't');
    let deserialize_flags = sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE;
    if (!immutable) {
        deserialize_flags |= sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE;
    }
    const rc = sqlite3.capi.sqlite3_deserialize(
        db.pointer!, 'main', p, arrayBuffer.byteLength, arrayBuffer.byteLength, deserialize_flags);
    db.checkRc(rc);
    return new DB(db);
  }

  toArrayBuffer(sqlite3: Sqlite3Static): ArrayBuffer {
    return sqlite3.capi.sqlite3_js_db_export(this.inner.pointer!, 'main');
  }
}