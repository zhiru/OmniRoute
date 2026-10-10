import { NextResponse } from "next/server";
import { z } from "zod";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { createErrorResponse } from "@/lib/api/errorResponse";
import { validateProviderApiKeySchema } from "@/shared/validation/schemas";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { POST as validateProvider } from "../../validate/route";

const schema = validateProviderApiKeySchema.safeExtend({ provider: z.literal("anthropic") });

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request, { alwaysRequireAuth: true });
  if (authError) return authError;

  let rawBody: unknown;
  try {
    rawBody = await request.clone().json();
  } catch {
    return createErrorResponse({ status: 400, message: "Invalid JSON body" });
  }

  const validation = validateBody(schema, rawBody);
  if (isValidationFailure(validation)) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  return validateProvider(request);
}
