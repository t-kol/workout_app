import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = "https://mefzryzzgoqaarymgych.supabase.co/rest/v1/";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lZnpyeXp6Z29xYWFyeW1neWNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNjY2MzMsImV4cCI6MjEwMjc0MjYzM30.P4XzR5ix5WXPWPPe9DfCiiJUkyaontqvzWC96Xz0AVI";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);