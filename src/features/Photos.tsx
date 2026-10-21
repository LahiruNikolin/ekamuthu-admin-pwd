import { confirmAction as confirm } from "@/confirm";
import {
  useData,
  useAction,
  adminApi,
  Page,
  Load,
  type RecordData,
} from "./shared";
import type { OperatorContextValue } from "@/operator/types";
async function compress(file: File) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not process image")),
      "image/jpeg",
      0.8,
    ),
  );
}
export default function Photos({ selectedCourtId }: OperatorContextValue) {
  const query = useData<RecordData>(
    `/courts/${selectedCourtId}`,
    !!selectedCourtId,
  );
  const action = useAction();
  const urls: string[] = query.data?.image_urls || [];
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    await action.run(async () => {
      let current = [...urls];
      for (const file of Array.from(files)) {
        const blob = await compress(file);
        const data = await adminApi.post<{
          upload_url: string;
          public_url: string;
        }>(`/courts/${selectedCourtId}/image-upload-url`, {
          content_type: "image/jpeg",
        });
        const response = await fetch(data.upload_url, {
          method: "PUT",
          headers: { "Content-Type": "image/jpeg" },
          body: blob,
        });
        if (!response.ok) throw new Error("Upload failed");
        current = [...current, data.public_url];
        await adminApi.put(`/courts/${selectedCourtId}/images`, {
          image_urls: current,
        });
      }
    }, "Photos uploaded");
  }
  return (
    <Page title="Venue photos">
      <Load query={query} />
      {action.feedback}
      <label className="field">
        Add photos
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={action.busy || !selectedCourtId}
          onChange={(e) => {
            void upload(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
      {urls.map((url, index) => (
        <article className="feature-card" key={url}>
          <img
            src={url}
            alt={`Venue photo ${index + 1}`}
            loading="lazy"
            width="320"
            height="200"
            style={{ objectFit: "cover" }}
            onError={(e) => {
              e.currentTarget.alt = "Image missing";
            }}
          />
          <div className="actions">
            <button
              disabled={action.busy || index === 0}
              onClick={() =>
                void action.run(
                  () =>
                    adminApi.put(`/courts/${selectedCourtId}/images`, {
                      image_urls: [url, ...urls.filter((x) => x !== url)],
                    }),
                  "Cover photo updated",
                )
              }
            >
              Set cover
            </button>
            <button
              disabled={action.busy}
              onClick={async () => {
                if (await confirm("Delete this photo?"))
                  void action.run(
                    () =>
                      adminApi.delete(`/courts/${selectedCourtId}/image`, {
                        public_url: url,
                      }),
                    "Photo deleted",
                  );
              }}
            >
              Delete
            </button>
          </div>
        </article>
      ))}
    </Page>
  );
}
