export class ApiError extends Error {
  constructor(
    public readonly status: 400 | 403 | 404 | 409,
    public readonly code: string,
    message: string,
    public readonly details?: {
      incompatibleDefinitionIds?: string[];
      missingDefinitionIds?: string[];
    },
  ) {
    super(message);
  }
}
