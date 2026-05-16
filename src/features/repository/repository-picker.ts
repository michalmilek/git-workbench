import { open } from "@tauri-apps/plugin-dialog";

export type CloneRepositoryInput =
  | {
      remoteUrl: string;
      destinationPath: string;
    }
  | {
      message: string;
    };

export async function selectRepositoryDirectory(title = "Open repository folder"): Promise<string | null> {
  const selectedPath = await open({
    directory: true,
    multiple: false,
    title
  });

  return typeof selectedPath === "string" ? selectedPath : null;
}

export function buildCloneRepositoryInput(input: { remoteUrl: string; destinationPath: string }): CloneRepositoryInput {
  const remoteUrl = input.remoteUrl.trim();
  const destinationPath = input.destinationPath.trim();

  if (remoteUrl.length === 0) {
    return { message: "Enter a repository URL before cloning." };
  }

  if (destinationPath.length === 0) {
    return { message: "Choose a destination folder before cloning." };
  }

  return { destinationPath, remoteUrl };
}
