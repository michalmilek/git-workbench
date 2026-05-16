import { describe, expect, test } from "vitest";

import { buildHunkPatch, parseDiffHunks } from "./diff-hunks";

describe("parseDiffHunks", () => {
  test("parses ordinary text diffs with multiple hunks", () => {
    const parsed = parseDiffHunks(`diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,4 +1,4 @@
 const first = 1;
-const second = 2;
+const second = 20;
 const third = 3;
 const fourth = 4;
@@ -10,3 +10,4 @@ export function run() {
   start();
+  finish();
 }
`);

    expect(parsed).toEqual({
      files: [
        {
          headerLines: [
            "diff --git a/src/app.ts b/src/app.ts",
            "index 1111111..2222222 100644",
            "--- a/src/app.ts",
            "+++ b/src/app.ts"
          ],
          hunks: [
            {
              header: "@@ -1,4 +1,4 @@",
              id: "0:0",
              lines: [
                "@@ -1,4 +1,4 @@",
                " const first = 1;",
                "-const second = 2;",
                "+const second = 20;",
                " const third = 3;",
                " const fourth = 4;"
              ]
            },
            {
              header: "@@ -10,3 +10,4 @@ export function run() {",
              id: "0:1",
              lines: ["@@ -10,3 +10,4 @@ export function run() {", "   start();", "+  finish();", " }"]
            }
          ]
        }
      ]
    });
  });

  test("parses new and deleted file diffs", () => {
    const parsed = parseDiffHunks(`diff --git a/new.txt b/new.txt
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/new.txt
@@ -0,0 +1,2 @@
+first
+second
diff --git a/old.txt b/old.txt
deleted file mode 100644
index 2222222..0000000
--- a/old.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-first
-second
`);

    expect(parsed.files).toHaveLength(2);
    expect(parsed.files[0]?.headerLines).toEqual([
      "diff --git a/new.txt b/new.txt",
      "new file mode 100644",
      "index 0000000..1111111",
      "--- /dev/null",
      "+++ b/new.txt"
    ]);
    expect(parsed.files[0]?.hunks[0]?.lines).toEqual(["@@ -0,0 +1,2 @@", "+first", "+second"]);
    expect(parsed.files[1]?.headerLines).toEqual([
      "diff --git a/old.txt b/old.txt",
      "deleted file mode 100644",
      "index 2222222..0000000",
      "--- a/old.txt",
      "+++ /dev/null"
    ]);
    expect(parsed.files[1]?.hunks[0]?.lines).toEqual(["@@ -1,2 +0,0 @@", "-first", "-second"]);
  });

  test("returns no hunks for empty binary and malformed diffs", () => {
    expect(parseDiffHunks("").files).toEqual([]);
    expect(
      parseDiffHunks(`diff --git a/image.png b/image.png
index 1111111..2222222 100644
Binary files a/image.png and b/image.png differ
`).files
    ).toEqual([]);
    expect(
      parseDiffHunks(`diff --git a/file.txt b/file.txt
@@ -1 +1 @@
-old
+new
`).files
    ).toEqual([]);
  });

  test("returns no hunks for header-only empty file patches", () => {
    expect(
      parseDiffHunks(`diff --git a/empty.txt b/empty.txt
new file mode 100644
--- /dev/null
+++ b/empty.txt
@@ -0,0 +1,0 @@
`).files
    ).toEqual([]);
  });
});

describe("buildHunkPatch", () => {
  test("returns a complete patch for a selected hunk", () => {
    const parsed = parseDiffHunks(`diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,2 @@
-old
+new
@@ -8,2 +8,3 @@
 keep
+added
`);

    expect(buildHunkPatch(parsed, "0:1")).toBe(`diff --git a/src/app.ts b/src/app.ts
index 1111111..2222222 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -8,2 +8,3 @@
 keep
+added
`);
  });

  test("throws for unknown hunks", () => {
    const parsed = parseDiffHunks(`diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt
@@ -1 +1 @@
-old
+new
`);

    expect(() => buildHunkPatch(parsed, "9:9")).toThrow("Unknown diff hunk: 9:9");
  });
});
