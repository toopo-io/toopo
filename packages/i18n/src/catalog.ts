export type LocaleCatalog = { readonly [key: string]: string | LocaleCatalog };

export type CatalogShape<T> = T extends string
  ? string
  : { readonly [K in keyof T]: CatalogShape<T[K]> };
