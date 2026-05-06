export type PackageRef = {
    name: string;
    version: string;
}

export type Maintainer = {
    name?: string;
    email?: string;
}

export type ResolvedPackage = {
    name: string;
    version: string;
    tarballUrl: string;
    publishTime?: string;
    maintainers: Maintainer[];
}