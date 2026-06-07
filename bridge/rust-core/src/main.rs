use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

fn python_bin() -> String {
    env::var("ZHIMENG_PYTHON").unwrap_or_else(|_| "python".to_string())
}

fn project_root() -> PathBuf {
    env::var("ZHIMENG_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")))
}

fn bridge_script(root: &Path, script: &str) -> PathBuf {
    root.join("bridge").join(script)
}

fn run_python(script: PathBuf, args: &[String]) -> ExitCode {
    let status = Command::new(python_bin())
        .arg(script)
        .args(args)
        .status();
    match status {
        Ok(status) => ExitCode::from(status.code().unwrap_or(1) as u8),
        Err(error) => {
            eprintln!("failed to launch python bridge: {error}");
            ExitCode::from(1)
        }
    }
}

fn print_help() {
    println!("Zhimeng Personal OS Rust Core Wrapper");
    println!();
    println!("Usage:");
    println!("  zhimeng-core health");
    println!("  zhimeng-core serve [gateway args]");
    println!("  zhimeng-core stdio [stdio args]");
    println!("  zhimeng-core version");
    println!();
    println!("Environment:");
    println!("  ZHIMENG_ROOT    Project root; defaults to current directory.");
    println!("  ZHIMENG_PYTHON  Python executable; defaults to python.");
}

fn main() -> ExitCode {
    let mut args: Vec<String> = env::args().skip(1).collect();
    let command = args.first().cloned().unwrap_or_else(|| "help".to_string());
    if !args.is_empty() {
        args.remove(0);
    }
    let root = project_root();
    match command.as_str() {
        "health" => run_python(bridge_script(&root, "healthcheck_bridge.py"), &args),
        "serve" => {
            let mut serve_args = vec!["--serve".to_string()];
            serve_args.extend(args);
            run_python(bridge_script(&root, "zhimeng_bridge.py"), &serve_args)
        }
        "stdio" => run_python(bridge_script(&root, "zhimeng_mcp_stdio.py"), &args),
        "version" => {
            println!("zhimeng-personal-os-core 0.1.0");
            ExitCode::SUCCESS
        }
        "help" | "--help" | "-h" => {
            print_help();
            ExitCode::SUCCESS
        }
        other => {
            eprintln!("unknown command: {other}");
            print_help();
            ExitCode::from(2)
        }
    }
}
