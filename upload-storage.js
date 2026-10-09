(() => {
  const DATABASE_NAME = "flo-file-transfer";
  const STORE_NAME = "uploads";
  let databasePromise;

  function openDatabase() {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        if (!window.indexedDB) {
          reject(new Error("This browser does not support persistent file storage."));
          return;
        }

        const request = window.indexedDB.open(DATABASE_NAME, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) {
            request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
          }
        };
        request.onsuccess = () => {
          const database = request.result;
          database.onversionchange = () => database.close();
          resolve(database);
        };
        request.onerror = () => reject(request.error || new Error("Could not open file storage."));
        request.onblocked = () => reject(new Error("File storage is blocked by another open tab."));
      }).catch((error) => {
        databasePromise = null;
        throw error;
      });
    }
    return databasePromise;
  }

  async function save(id, file) {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const completed = new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error("Could not save the file."));
      transaction.onabort = () => reject(transaction.error || new Error("Saving the file was cancelled."));
    });

    transaction.objectStore(STORE_NAME).put({
      id,
      file,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
    });
    await completed;
  }

  async function get(id) {
    const database = await openDatabase();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(id);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error("Could not read the saved file."));
      transaction.onabort = () => reject(transaction.error || new Error("Reading the file was cancelled."));
    });
  }

  window.uploadFileStorage = { save, get };
})();
