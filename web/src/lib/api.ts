export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string })?.error ?? res.statusText);
  return data as T;
}

/** Upload with progress (fetch has no upload progress). */
export function upload(path: string, file: File, onProgress?: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api${path}?filename=${encodeURIComponent(file.name)}`);
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status < 300) return resolve();
      try {
        reject(new ApiError(xhr.status, JSON.parse(xhr.responseText).error));
      } catch {
        reject(new ApiError(xhr.status, xhr.statusText));
      }
    };
    xhr.onerror = () => reject(new ApiError(0, "Network error"));
    xhr.send(file);
  });
}
