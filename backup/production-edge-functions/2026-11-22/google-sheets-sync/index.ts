import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-oikko-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (data: object, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const suppliedSecret = req.headers.get("x-oikko-secret");
    const expectedSecret = Deno.env.get("OIKKO_SYNC_SECRET");

    if (!expectedSecret || suppliedSecret !== expectedSecret) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      return json({ error: "Server configuration missing" }, 500);
    }

    const body = await req.json();

    if (!body.responseId || !body.email || !body.phone) {
      return json({ error: "Response ID, email and phone are required" }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const member = {
      form_response_id: String(body.responseId),
      member_no: null,
      full_name: String(body.fullName || body.fullNameBn || "").trim(),
      full_name_bn: body.fullNameBn || null,
      father_name: body.fatherName || null,
      mother_name: body.motherName || null,
      spouse_name: body.spouseName || null,
      date_of_birth: body.dateOfBirth || null,
      gender: body.gender || null,
      profession: body.profession || null,
      phone: String(body.phone).trim(),
      alternate_phone: body.alternatePhone || null,
      email: String(body.email).trim().toLowerCase(),
      whatsapp: body.whatsapp || null,
      present_address: body.presentAddress || null,
      permanent_address: body.permanentAddress || null,
      district: body.district || null,
      upazila: body.upazila || null,
      joining_date: body.joiningDate || null,
      member_note: body.memberNote || null,
      emergency_contact_name: body.emergencyContactName || null,
      emergency_contact_relation: body.emergencyContactRelation || null,
      emergency_contact_phone: body.emergencyContactPhone || null,
      nominee_name: body.nomineeName || null,
      nominee_relation: body.nomineeRelation || null,
      nominee_phone: body.nomineePhone || null,
      nominee_address: body.nomineeAddress || null,
      data_consent: body.dataConsent || null,
      account_consent: body.accountConsent || null,
      status: "pending",
    };

    const { error } = await supabase
      .from("members")
      .insert(member);

    if (error?.code === "23505") {
      return json({ success: true, duplicate: true });
    }

    if (error) {
      console.error("Database insert failed:", error);
      return json({ error: "Database insert failed" }, 500);
    }

    return json({ success: true, status: "pending" });

  } catch (error) {
    console.error("Sync error:", error);
    return json({ error: "Invalid request or server error" }, 500);
  }
});