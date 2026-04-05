// prevent extra console window on windows release dont remove!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    openarc_studio_lib::run()
}
