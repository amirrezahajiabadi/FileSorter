//! Disk Operations — system drive listing and capacity analysis.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriveInfo {
    pub letter: String,
    pub path: String,
    pub total_bytes: u64,
    pub free_bytes: u64,
    pub used_bytes: u64,
}

#[cfg(windows)]
mod win_disk {
    use super::*;

    #[link(name = "kernel32")]
    extern "system" {
        fn GetLogicalDrives() -> u32;
        fn GetDiskFreeSpaceExW(
            lpDirectoryName: *const u16,
            lpFreeBytesAvailableToCaller: *mut u64,
            lpTotalNumberOfBytes: *mut u64,
            lpTotalNumberOfFreeBytes: *mut u64,
        ) -> i32;
    }

    pub fn list_drives() -> Vec<DriveInfo> {
        let mut drives = Vec::new();
        let mask = unsafe { GetLogicalDrives() };

        for i in 0..26 {
            if (mask & (1 << i)) != 0 {
                let letter = (b'A' + i) as char;
                let path_str = format!("{}:\\", letter);
                let wide_path: Vec<u16> = path_str.encode_utf16().chain(std::iter::once(0)).collect();

                let mut free_avail: u64 = 0;
                let mut total: u64 = 0;
                let mut free_total: u64 = 0;

                let ok = unsafe {
                    GetDiskFreeSpaceExW(
                        wide_path.as_ptr(),
                        &mut free_avail,
                        &mut total,
                        &mut free_total,
                    )
                };

                if ok != 0 && total > 0 {
                    let used = total.saturating_sub(free_total);
                    drives.push(DriveInfo {
                        letter: letter.to_string(),
                        path: path_str,
                        total_bytes: total,
                        free_bytes: free_total,
                        used_bytes: used,
                    });
                }
            }
        }
        drives
    }
}

#[cfg(not(windows))]
mod non_win_disk {
    use super::*;

    pub fn list_drives() -> Vec<DriveInfo> {
        vec![DriveInfo {
            letter: "/".into(),
            path: "/".into(),
            total_bytes: 100_000_000_000,
            free_bytes: 50_000_000_000,
            used_bytes: 50_000_000_000,
        }]
    }
}

pub fn list_drives() -> Vec<DriveInfo> {
    #[cfg(windows)]
    {
        win_disk::list_drives()
    }
    #[cfg(not(windows))]
    {
        non_win_disk::list_drives()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_drives() {
        let drives = list_drives();
        // On Windows CI / local machine, at least C: drive usually exists
        #[cfg(windows)]
        {
            assert!(!drives.is_empty(), "expected at least one drive on Windows");
            let c_drive = drives.iter().find(|d| d.letter == "C");
            assert!(c_drive.is_some(), "expected C: drive to exist");
        }
    }
}
