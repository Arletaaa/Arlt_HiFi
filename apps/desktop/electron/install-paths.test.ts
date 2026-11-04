import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseInstalledLibraryRoot, readInstalledLibraryRoot } from "./install-paths.js";

const temporaryDirectories: string[] = [];

const createUserDataDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), "arlt-install-paths-"));
  temporaryDirectories.push(directory);

  return directory;
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("parseInstalledLibraryRoot", () => {
  it("reads the libraryRoot written by the NSIS installer", () => {
    expect(parseInstalledLibraryRoot("[paths]\r\nlibraryRoot=D:\\Arlt-HiFi Library\r\n")).toBe(
      "D:\\Arlt-HiFi Library"
    );
  });

  it("ignores BOM, surrounding whitespace and unrelated keys", () => {
    expect(
      parseInstalledLibraryRoot("\uFEFF[paths]\r\nother=1\r\n  libraryRoot = C:\\Music\\Arlt-HiFi Library  \r\n")
    ).toBe("C:\\Music\\Arlt-HiFi Library");
  });

  it("returns null for missing, empty or relative values", () => {
    expect(parseInstalledLibraryRoot("[paths]\r\nlibraryRoot=\r\n")).toBeNull();
    expect(parseInstalledLibraryRoot("[paths]\r\nlibraryRoot=relative\\library\r\n")).toBeNull();
    expect(parseInstalledLibraryRoot("")).toBeNull();
  });
});

describe("readInstalledLibraryRoot", () => {
  it("reads the library root the installer wrote into userData", async () => {
    const userData = await createUserDataDirectory();
    await writeFile(
      join(userData, "install.ini"),
      "[paths]\r\nlibraryRoot=C:\\Music\\Arlt-HiFi Library\r\n",
      "utf8"
    );

    await expect(readInstalledLibraryRoot(userData)).resolves.toBe("C:\\Music\\Arlt-HiFi Library");
  });

  it("decodes the UTF-16LE install.ini written by NSIS", async () => {
    const userData = await createUserDataDirectory();
    await writeFile(
      join(userData, "install.ini"),
      Buffer.from("\uFEFF[paths]\r\nlibraryRoot=H:\\Arlt-HiFi Library\r\n", "utf16le")
    );

    await expect(readInstalledLibraryRoot(userData)).resolves.toBe("H:\\Arlt-HiFi Library");
  });

  it("also decodes UTF-16LE without a BOM", async () => {
    const userData = await createUserDataDirectory();
    await writeFile(
      join(userData, "install.ini"),
      Buffer.from("[paths]\r\nlibraryRoot=E:\\Music\\Arlt-HiFi Library\r\n", "utf16le")
    );

    await expect(readInstalledLibraryRoot(userData)).resolves.toBe("E:\\Music\\Arlt-HiFi Library");
  });

  it("falls back to the install directory when userData has no config", async () => {
    const userData = await createUserDataDirectory();
    const installDirectory = await createUserDataDirectory();
    await writeFile(
      join(installDirectory, "install.ini"),
      Buffer.from("\uFEFF[paths]\r\nlibraryRoot=F:\\Music\\Arlt-HiFi Library\r\n", "utf16le")
    );

    await expect(readInstalledLibraryRoot(userData, installDirectory)).resolves.toBe("F:\\Music\\Arlt-HiFi Library");
  });

  it("returns null when there is no install record (dev mode)", async () => {
    const userData = await createUserDataDirectory();

    await expect(readInstalledLibraryRoot(userData)).resolves.toBeNull();
  });
});
