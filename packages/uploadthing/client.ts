import type { FileRouter } from "./server";

const createRequestPermsUrl = (config: { url?: string; slug: string }) => {
  const queryParams = `?actionType=upload&slug=${config.slug}`;

  return `${config?.url ?? "/api/uploadthing"}${queryParams}`;
};

export const DANGEROUS__uploadFiles = async <T extends string>(
  files: File[],
  endpoint: T,
  config?: {
    url?: string;
  }
) => {
  // Get presigned URL for S3 upload
  const s3ConnectionRes = await fetch(
    createRequestPermsUrl({ url: config?.url, slug: endpoint }),
    {
      method: "POST",
      body: JSON.stringify({
        files: files.map((f) => f.name),
      }),
    }
  ).then((res) => res.json());
  console.log("we got s3 things made I think", s3ConnectionRes);

  if (!s3ConnectionRes) throw "no url received";

  const fileUploadPromises = s3ConnectionRes.map(async (presigned: any) => {
    const file = files.find((f) => f.name === presigned.name);

    if (!file) {
      console.error("No file found for presigned URL", presigned);
      throw new Error("file not found");
    }
    const { url, fields } = presigned.presignedUrl;
    const formData = new FormData();

    // Give content type to blobs because S3 is dumb
    formData.append("Content-Type", file.type);
    console.log("FILE TYPE", file.type);

    // Dump all values from response (+ the file itself) into form for S3 upload
    Object.entries({ ...fields, file: file }).forEach(([key, value]) => {
      formData.append(key, value as Blob);
    });

    // Do S3 upload
    const upload = await fetch(url, {
      method: "POST",
      body: formData,
      headers: new Headers({
        Accept: "application/xml",
      }),
    });

    if (!upload.ok) throw new Error("Upload failed.");
    // Generate a URL for the uploaded image since AWS won't give me one
    const genUrl =
      "https://uploadthing.com/f/" + encodeURIComponent(fields["key"]);

    console.log("URL for uploaded image", genUrl);

    return {
      fileKey: presigned.key,
      fileUrl: genUrl,
    };
  });

  return Promise.all(fileUploadPromises);
};

export type UploadFileType<T extends string> = typeof DANGEROUS__uploadFiles<T>;

export const genUploader = <
  TRouter extends FileRouter
>(): typeof DANGEROUS__uploadFiles<
  keyof TRouter extends string ? keyof TRouter : string
> => {
  return DANGEROUS__uploadFiles;
};